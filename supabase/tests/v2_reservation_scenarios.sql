-- Etapa 2.6: reserva do motorista, total definitivo, barreira operacional, expiração/cancelamento, SEM_ENTREGADOR.
-- MODO DE TESTE: transação desfeita; remove os CHECKs e liga as chaves V2 só ali dentro; pings desligados.
-- Rodar: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/tests/v2_reservation_scenarios.sql
-- ===== modo de teste (só nesta transação, desfeita): liga as chaves V2 =====
alter table public.delivery_dispatch_settings drop constraint dds_new_flow_inactive_check;
alter table public.store_delivery_flow drop constraint store_delivery_flow_inactive_check;
update public.delivery_dispatch_settings set new_delivery_flow_enabled = true;
update public.store_delivery_flow set v2_enabled = true where store_id = '93e432b4-0472-4ae4-abb1-45b516e2f7bd';
select set_config('app.skip_delivery_ping', '1', true);

create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true); end $f$;

-- configuração-base de cada teste (constraints dds_* respeitadas)
create or replace function pg_temp.cfg(p jsonb default '{}') returns void language plpgsql as $f$
declare k text; v text;
begin
  update public.delivery_dispatch_settings set
    initial_radius_km = 5, radius_step_km = 3, max_radius_km = 25, min_freight = 0, max_freight = 60,
    increase_kind = 'fixed', increase_value = 1, auto_increase_enabled = true, auto_increase_cap_amount = 3, auto_increase_cap_percent = null,
    max_price_adjustments = 5, price_adjust_interval_minutes = 1, max_rounds = 10, max_search_minutes = 30,
    offer_duration_seconds = 60, retry_interval_minutes = 5, search_strategy = 'RAIO_E_PRECO_SIMULTANEAMENTE',
    freight_rounding_step = 0.01, freight_rounding_mode = 'NEAREST', customer_authorization_timeout_minutes = 10, platform_fee_percent = 0;
  for k, v in select key, value from jsonb_each_text(p) loop
    if v is null then execute format('update public.delivery_dispatch_settings set %I = null', k);
    else execute format('update public.delivery_dispatch_settings set %I = %L', k, v); end if;
  end loop;
end $f$;

-- pedido V2 com estimativa de valor escolhido (linha direta, só no teste) e aceite da loja
create or replace function pg_temp.mk(p_fee numeric, p_cust uuid) returns jsonb language plpgsql as $f$
declare st uuid := '93e432b4-0472-4ae4-abb1-45b516e2f7bd'; prod uuid := 'bdf2d5b5-3879-4c8f-bd9a-6a6241b24570';
  addr text := 'Rua Dom Pedro II, 800, Porto Velho'; est uuid; j jsonb; o uuid; owner uuid; d record;
begin
  select owner_id into owner from stores where id = st;
  insert into delivery_estimates(customer_id, store_id, destination_lat, destination_lng, destination_address, estimated_freight, distance_km, calculation_version, snapshot, expires_at)
    values (p_cust, st, -8.763734, -63.909044, lower(addr), p_fee, 5, 'est-v1', '{"destination_check":"verified"}', now() + interval '30 minutes') returning id into est;
  perform pg_temp.as_user(p_cust); set local role authenticated;
  j := create_store_order(st, jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 1)), 'entrega', 'pix', addr, -8.763734, -63.909044, null, null, null, null, est);
  reset role; o := (j->>'order_id')::uuid;
  perform pg_temp.as_user(owner); set local role authenticated; update orders set status = 'preparing' where id = o; reset role;
  select id, ride_request_id into d from order_delivery_dispatches where order_id = o;
  return jsonb_build_object('order', o, 'dispatch', d.id, 'ride', d.ride_request_id);
end $f$;

create or replace function pg_temp.expire(p_d uuid) returns void language sql as $f$ update order_delivery_dispatches set offer_expires_at = now() - interval '1 second' where id = p_d and phase = 'PROCURANDO_ENTREGADOR' $f$;
create or replace function pg_temp.age_price(p_d uuid) returns void language sql as $f$ update order_delivery_dispatches set last_price_change_at = now() - interval '1 day' where id = p_d $f$;
create or replace function pg_temp.step(p_d uuid) returns text language plpgsql as $f$
begin perform pg_temp.expire(p_d); perform pg_temp.age_price(p_d); return _advance_delivery_search_v2(p_d); end $f$;
create or replace function pg_temp.st(p_d uuid) returns text language sql as $f$
  select format('r%s %skm R$%s lim%s adj%s auth%s %s', round, radius_km, final_freight, price_limit, price_adjustments, (select count(*) from delivery_reajust_authorizations a where a.dispatch_id = p_d), phase) from order_delivery_dispatches where id = p_d $f$;
create or replace function pg_temp.cfg2(p jsonb default '{}') returns void language plpgsql as $f$
begin
  perform pg_temp.cfg(p - 'reservation_timeout_minutes' - 'reservation_expiry_action' - 'cancel_customer_during_reservation' - 'cancel_driver_after_reservation');
  update public.delivery_dispatch_settings set reservation_timeout_minutes = coalesce((p->>'reservation_timeout_minutes')::int, 5),
     reservation_expiry_action = coalesce(p->>'reservation_expiry_action', 'RELEASE_AND_SEARCH_AGAIN'),
     cancel_customer_during_reservation = coalesce((p->>'cancel_customer_during_reservation')::boolean, true),
     cancel_driver_after_reservation = coalesce((p->>'cancel_driver_after_reservation')::boolean, true);
end $f$;
-- aceita como o motorista (candidatura no valor vigente)
create or replace function pg_temp.accept(p_ride uuid, p_drv uuid) returns void language plpgsql as $f$
begin insert into ride_applications(ride_request_id, applicant_id, status, proposed_price) select p_ride, p_drv, 'pending', offered_price from ride_requests where id = p_ride; end $f$;
create or replace function pg_temp.view(p_user uuid, p_order uuid) returns jsonb language plpgsql as $f$
declare v jsonb; begin perform pg_temp.as_user(p_user); set local role authenticated; v := get_order_delivery_view(p_order); reset role; return v; end $f$;

do $$
declare st uuid := '93e432b4-0472-4ae4-abb1-45b516e2f7bd';
  cust uuid; other uuid; owner uuid; drvA uuid; drvB uuid; res text := ''; x jsonb; d uuid; ride uuid; o uuid; v jsonb;
  rec record; rec2 record; n int; n2 int; r text; hint text; lat0 double precision; lng0 double precision; seq text; t0 timestamptz;
begin
  select id into cust from auth.users where email = 'usuarioteste@gmail.com';
  select id into other from profiles where "profileSlug" = 'lucy';
  select owner_id, store_lat, store_lng into owner, lat0, lng0 from stores where id = st;
  select id into drvA from profiles where "profileSlug" = 'natancastelano';
  select driver_id into drvB from driver_pricing where driver_id not in (cust, other, owner, drvA) order by driver_id limit 1;
  insert into driver_payout_keys(driver_id, pix_key_type, pix_key) values (drvA, 'email', 'a.teste@pix.com'), (drvB, 'email', 'b.teste@pix.com') on conflict do nothing;   -- V2 exige Pix do motorista (2.7)
  update driver_pricing set live_lat = lat0 + 0.005, live_lng = lng0, live_updated_at = now(), delivery_radius_km = null where driver_id = drvA;
  update driver_pricing set live_lat = lat0 + 0.004, live_lng = lng0, live_updated_at = now(), delivery_radius_km = null where driver_id = drvB;

  -- ===== T1-T8: aceite → reserva → total definitivo =====
  perform pg_temp.cfg2('{"max_radius_km":5,"reservation_timeout_minutes":7}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid; o := (x->>'order')::uuid;
  r := pg_temp.step(d);                                                -- oferta sobe para 13
  v := pg_temp.view(cust, o);
  res := res || format('antes do aceite: estado=%s total estimado=%s (produtos %s + entrega %s) definitivo=%s | ', v->>'state', v->>'total_amount', v->>'items_total', v->>'delivery_fee', v->>'definitive');
  perform pg_temp.accept(ride, drvA);
  select * into rec from order_delivery_dispatches where id = d;
  res := res || format('T1/T2/T3/T5/T6 aceite: status=%s fase=%s frozen=%s estimada=%s reservado_em=%s | ', rec.status, rec.phase, rec.frozen_freight, rec.estimated_freight, rec.reserved_at is not null);
  res := res || format('T4 reserva = %s min (admin 7) | ', round(extract(epoch from (rec.reserved_until - rec.reserved_at)) / 60));
  select string_agg(coalesce(phase_from, '-') || '>' || phase_to, ' ; ' order by created_at, id) into seq from order_delivery_events where dispatch_id = d and kind = 'phase_change';
  res := res || format('fases: %s | ', seq);
  v := pg_temp.view(cust, o);
  res := res || format('T7/T8/T18 cliente: estado=%s produtos=%s entrega=%s TOTAL=%s estimativa inicial=%s definitivo=%s motorista=%s reserva ate=%s | ', v->>'state', v->>'items_total', v->>'delivery_fee', v->>'total_amount', v->>'estimated_freight', v->>'definitive', v#>>'{driver,slug}', (v->>'reserved_until') is not null);
  select count(*) into n from ride_requests where id = ride and driver_id = drvA and status = 'accepted'; res := res || format('(motorista vinculado=%s) | ', n);

  -- ===== T9-T12: adulteração =====
  perform pg_temp.as_user(cust); set local role authenticated;
  update orders set total_amount = 1, delivery_fee = 1 where id = o; get diagnostics n = row_count; res := res || format('T9 cliente alterar total afetou %s linhas | ', n);
  begin update order_delivery_dispatches set frozen_freight = 1 where id = d; get diagnostics n = row_count; res := res || format('T10 cliente alterou frozen (linhas=%s) | ', n); exception when others then res := res || 'T10 cliente nao altera frozen | '; end;
  reset role;
  perform pg_temp.as_user(drvA); set local role authenticated;
  begin update order_delivery_dispatches set frozen_freight = 1 where id = d; get diagnostics n = row_count; res := res || format('T11 motorista alterou frozen (linhas=%s) | ', n); exception when others then res := res || 'T11 motorista nao altera frozen | '; end;
  begin update ride_requests set driver_id = drvB where id = ride; res := res || 'T12 motorista trocou o vencedor(BAD) | '; exception when others then res := res || 'T12 motorista nao troca o vencedor | '; end;
  -- ===== T13-T15: barreira operacional =====
  begin update ride_requests set driver_en_route = true, driver_departed_at = now() where id = ride; res := res || 'T13 motorista iniciou a retirada(BAD) | ';
  exception when others then get stacked diagnostics hint = pg_exception_hint; res := res || format('T13/T15 iniciar retirada recusado no banco (%s) | ', coalesce(hint, sqlstate)); end;
  begin update ride_requests set driver_arrived_at = now() where id = ride; res := res || 'chegou(BAD) | '; exception when others then res := res || 'marcar chegada recusado | '; end;
  begin update ride_requests set ride_started_at = now() where id = ride; res := res || 'iniciou(BAD) | '; exception when others then res := res || 'iniciar corrida recusado | '; end;
  begin perform complete_ride(ride, -8.7860, -63.8760); res := res || 'T14 complete_ride(BAD) | '; exception when others then res := res || 'T14 complete_ride recusado | '; end;
  begin update ride_requests set status = 'completed' where id = ride; res := res || 'concluir direto(BAD) | '; exception when others then res := res || 'concluir direto recusado | '; end;
  -- T16 motorista vê a reserva
  v := get_driver_delivery_gate(ride);
  res := res || format('T16 motorista: v2=%s liberado=%s fase=%s reserva ate=%s valor=%s | ', v->>'v2', v->>'released', v->>'phase', (v->>'reserved_until') is not null, v->>'frozen_freight');
  reset role;
  -- T17/T19 quem não tem vínculo
  perform pg_temp.as_user(drvB); set local role authenticated;
  begin perform get_driver_delivery_gate(ride); res := res || 'T17 motorista errado viu a reserva(BAD) | '; exception when others then res := res || 'T17 motorista errado negado | '; end;
  begin perform get_order_delivery_view(o); res := res || 'motorista viu total do pedido(BAD) | '; exception when others then res := res || 'motorista sem acesso ao total do pedido | '; end;
  reset role;
  begin perform pg_temp.view(other, o); res := res || 'T19 usuario errado viu o pedido(BAD) | '; exception when others then reset role; res := res || 'T19 usuario errado negado | '; end;
  v := pg_temp.view(owner, o);
  res := res || format('T20 loja: estado=%s frozen=%s total=%s motorista=%s | ', v->>'state', v->>'frozen_freight', v->>'total_amount', v#>>'{driver,slug}');
  -- T21 reserva ativa impede outro vencedor
  perform pg_temp.accept(ride, drvB);
  select count(*) filter (where status = 'accepted'), count(*) filter (where status = 'rejected') into n, n2 from ride_applications where ride_request_id = ride;
  select driver_id = drvA as ok into rec from ride_requests where id = ride;
  res := res || format('T21 segundo candidato: aceitas=%s rejeitadas=%s motorista_continua_o_primeiro=%s | ', n, n2, rec.ok);

  -- ===== T22-T29: reserva expira → volta à busca =====
  update order_delivery_dispatches set reserved_at = now() - interval '10 minutes', reserved_until = now() - interval '1 second' where id = d;
  select round into n from order_delivery_dispatches where id = d;
  n2 := process_delivery_search_v2();
  res := res || format('T22 job 1: %s item(ns) | ', n2);
  select * into rec from order_delivery_dispatches where id = d;
  res := res || format('T22/T24/T25 apos expirar: status=%s fase=%s frozen=%s liberado_em=%s motivo=%s rodada %s->%s | ', rec.status, rec.phase, coalesce(rec.frozen_freight::text, 'NULL'), rec.reservation_released_at is not null, rec.reservation_release_reason, n, rec.round);
  select driver_id is null as livre, status into rec from ride_requests where id = ride;
  res := res || format('T23 motorista liberado=%s corrida=%s | ', rec.livre, rec.status);
  n2 := process_delivery_search_v2(); n := process_delivery_search_v2();
  select round into n from order_delivery_dispatches where id = d;
  res := res || format('T27 job repetido: %s e rodada continua %s | ', n2, n);
  select count(*) into n from order_delivery_rounds where dispatch_id = d and action = 'reopen'; res := res || format('T26 rodadas reopen=%s | ', n);
  select string_agg(kind || ':' || coalesce(data->>'reason', data->>'action', '') || coalesce(' R$' || (data->>'frozen_freight'), '') || coalesce(' liberado R$' || (data->>'released_frozen_freight'), ''), ' ; ' order by created_at, id) into seq
    from order_delivery_events where dispatch_id = d and kind in ('freight_frozen', 'driver_reserved', 'reservation_released');
  res := res || format('T28 historico: %s | ', seq);
  select status into r from order_delivery_rounds where dispatch_id = d and status = 'accepted' limit 1; res := res || format('(rodada do aceite anterior=%s) | ', coalesce(r, 'perdida'));
  v := pg_temp.view(cust, o);
  res := res || format('pedido voltou a: estado=%s entrega=%s total=%s definitivo=%s | ', v->>'state', v->>'delivery_fee', v->>'total_amount', v->>'definitive');
  -- T29 novo aceite não herda o congelado antigo: a oferta sobe e outro motorista aceita
  r := pg_temp.step(d);
  select final_freight, frozen_freight into rec from order_delivery_dispatches where id = d;
  res := res || format('antes do 2o aceite: oferta=%s frozen=%s | ', rec.final_freight, coalesce(rec.frozen_freight::text, 'NULL'));
  perform pg_temp.accept(ride, drvB);
  select * into rec from order_delivery_dispatches where id = d;
  res := res || format('T29 2o aceite: frozen=%s fase=%s liberado_em=%s | ', rec.frozen_freight, rec.phase, coalesce(rec.reservation_released_at::text, 'NULL'));
  v := pg_temp.view(cust, o);
  res := res || format('exemplo: produtos=%s + entrega=%s = TOTAL %s (estimativa inicial %s) | ', v->>'items_total', v->>'delivery_fee', v->>'total_amount', v->>'estimated_freight');
  select driver_id = drvB as ok into rec from ride_requests where id = ride; res := res || format('(vencedor=segundo motorista %s) | ', rec.ok);

  -- ===== T30: cancelamentos durante a reserva =====
  -- (a) cliente cancela
  perform pg_temp.as_user(cust); set local role authenticated; perform cancel_order_delivery(d); reset role;
  select status, phase, reservation_release_reason into rec from order_delivery_dispatches where id = d;
  select status into r from ride_requests where id = ride;
  select count(*) into n from delivery_obligations where dispatch_id = d; select count(*) into n2 from delivery_payment_events where dispatch_id = d;
  res := res || format('T30a cliente cancelou: %s %s motivo=%s corrida=%s obrigacoes=%s pagamentos=%s | ', rec.status, rec.phase, rec.reservation_release_reason, r, n, n2);
  -- (a2) com a opção desligada
  perform pg_temp.cfg2('{"max_radius_km":5,"cancel_customer_during_reservation":false}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid; o := (x->>'order')::uuid;
  perform pg_temp.accept(ride, drvA);
  perform pg_temp.as_user(cust); set local role authenticated;
  begin perform cancel_order_delivery(d); res := res || 'T30a2 cancelou com a opcao desligada(BAD) | '; exception when others then res := res || 'T30a2 cancelamento negado quando o admin desliga | '; end;
  reset role;
  -- (b) motorista cancela a reserva → volta à busca
  perform pg_temp.cfg2('{"max_radius_km":5}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid; o := (x->>'order')::uuid;
  perform pg_temp.accept(ride, drvA);
  perform pg_temp.as_user(drvA); set local role authenticated; update ride_requests set status = 'cancelled', cancelled_by = 'driver' where id = ride; reset role;
  select status, phase, reservation_release_reason, frozen_freight into rec from order_delivery_dispatches where id = d;
  select status, driver_id is null as livre, share_closed_at is null as aberta into rec2 from ride_requests where id = ride;
  select status into r from ride_applications where ride_request_id = ride and applicant_id = drvA;
  res := res || format('T30b motorista cancelou: entrega=%s %s motivo=%s frozen=%s | corrida=%s livre=%s link aberto=%s candidatura=%s | ', rec.status, rec.phase, rec.reservation_release_reason, coalesce(rec.frozen_freight::text, 'NULL'), rec2.status, rec2.livre, rec2.aberta, coalesce(r, 'removida'));
  -- (b2) opção desligada
  perform pg_temp.cfg2('{"max_radius_km":5,"cancel_driver_after_reservation":false}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid;
  perform pg_temp.accept(ride, drvA);
  perform pg_temp.as_user(drvA); set local role authenticated;
  begin update ride_requests set status = 'cancelled', cancelled_by = 'driver' where id = ride; res := res || 'T30b2 motorista cancelou com opcao desligada(BAD) | '; exception when others then res := res || 'T30b2 cancelamento do motorista negado quando o admin desliga | '; end;
  reset role;
  -- (c) loja cancela
  perform pg_temp.cfg2('{"max_radius_km":5}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid;
  perform pg_temp.accept(ride, drvA);
  perform pg_temp.as_user(owner); set local role authenticated; update ride_requests set status = 'cancelled', cancelled_by = 'requester' where id = ride; reset role;
  select status, phase, reservation_release_reason into rec from order_delivery_dispatches where id = d;
  res := res || format('T30c loja cancelou: %s %s motivo=%s | ', rec.status, rec.phase, rec.reservation_release_reason);

  -- ===== CANCEL_DELIVERY na expiração =====
  perform pg_temp.cfg2('{"max_radius_km":5,"reservation_expiry_action":"CANCEL_DELIVERY"}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid; o := (x->>'order')::uuid;
  perform pg_temp.accept(ride, drvA);
  update order_delivery_dispatches set reserved_at = now() - interval '10 minutes', reserved_until = now() - interval '1 second' where id = d;
  n := process_delivery_search_v2(); n2 := process_delivery_search_v2();
  select status, phase, reservation_release_reason into rec from order_delivery_dispatches where id = d; select status into r from ride_requests where id = ride;
  res := res || format('expiracao CANCEL_DELIVERY: %s %s motivo=%s corrida=%s job1=%s job2=%s | ', rec.status, rec.phase, rec.reservation_release_reason, r, n, n2);
  -- expiração sem tempo de busca restante → SEM_ENTREGADOR
  perform pg_temp.cfg2('{"max_radius_km":5}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid;
  perform pg_temp.accept(ride, drvA);
  update order_delivery_dispatches set reserved_at = now() - interval '10 minutes', reserved_until = now() - interval '1 second', created_at = now() - interval '2 hours' where id = d;
  n := process_delivery_search_v2();
  select status, phase, search_end_reason into rec from order_delivery_dispatches where id = d;
  res := res || format('expirou sem tempo de busca: %s %s motivo=%s | ', rec.status, rec.phase, rec.search_end_reason);

  -- ===== T31-T37: SEM_ENTREGADOR e dinheiro =====
  perform pg_temp.cfg2('{"max_radius_km":5,"max_price_adjustments":1}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid; o := (x->>'order')::uuid;
  r := pg_temp.step(d); r := pg_temp.step(d);
  select status, phase into rec from order_delivery_dispatches where id = d;
  res := res || format('T31 sem entregador: entrega=%s %s | ', rec.status, rec.phase);
  v := pg_temp.view(cust, o); res := res || format('cliente: estado=%s pedido=%s | ', v->>'state', v->>'order_status');
  v := pg_temp.view(owner, o); res := res || format('loja: estado=%s pedido=%s | ', v->>'state', v->>'order_status');
  select count(*) into n from order_delivery_events where dispatch_id = d and kind = 'reservation_notice' and data->>'reason' = 'no_driver' and processed_at is null;
  res := res || format('T31 avisos na fila (cliente+loja)=%s | ', n);
  select status into r from orders where id = o; res := res || format('T32 pedido=%s (nao pago) | ', r);
  select count(*) into n from delivery_obligations; select count(*) into n2 from delivery_payment_events;
  res := res || format('T33/T34 obrigacoes=%s pagamentos=%s | ', n, n2);
  select count(*) into n from order_delivery_rounds where platform_fee <> 0 or driver_offer <> final_freight;
  select count(*) into n2 from driver_postpaid_charges where ride_request_id = ride or order_id = o;
  res := res || format('T36 rodadas V2 com taxa<>0 ou repasse<>oferta=%s | T37 cobrancas no ledger deste pedido=%s | ', n, n2);
  raise exception 'RESULT: %', res;
end $$;
