-- Etapa 2.7: fluxo financeiro declaratório (loja recebeu → loja pagou motorista → motorista confirmou → liberação), Pix do motorista, verificação, janelas e cancelamentos.
-- MODO DE TESTE: transação desfeita; remove os CHECKs e liga as chaves V2 só ali dentro; pings desligados.
-- Rodar: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/tests/v2_payment_scenarios.sql
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

create or replace function pg_temp.as_role(p_uid uuid) returns void language plpgsql as $f$
begin perform pg_temp.as_user(p_uid); set local role authenticated; end $f$;
-- entrega V2 já reservada para drvA (oferta 13) aguardando o pagamento do cliente
create or replace function pg_temp.reserved(p_cust uuid, p_drv uuid) returns jsonb language plpgsql as $f$
declare x jsonb; d uuid; ride uuid;
begin
  perform pg_temp.cfg2('{"max_radius_km":5,"reservation_timeout_minutes":5}');
  x := pg_temp.mk(12, p_cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid;
  perform pg_temp.step(d);
  perform pg_temp.accept(ride, p_drv);
  return x;
end $f$;
create or replace function pg_temp.try(p_sql text) returns text language plpgsql as $f$
declare h text; begin execute p_sql; return 'ok'; exception when others then get stacked diagnostics h = pg_exception_hint; return 'negado(' || coalesce(h, sqlstate) || ')'; end $f$;

do $$
declare st uuid := '93e432b4-0472-4ae4-abb1-45b516e2f7bd';
  cust uuid; other uuid; owner uuid; drvA uuid; drvB uuid; res text := ''; x jsonb; d uuid; ride uuid; o uuid; v jsonb; w jsonb;
  rec record; n int; n2 int; r text; seq text; before_obl int;
begin
  select id into cust from auth.users where email = 'usuarioteste@gmail.com';
  select id into other from profiles where "profileSlug" = 'lucy';
  select owner_id into owner from stores where id = st;
  select id into drvA from profiles where "profileSlug" = 'natancastelano';
  select driver_id into drvB from driver_pricing where driver_id not in (cust, other, owner, drvA) order by driver_id limit 1;
  update driver_pricing set live_lat = (select store_lat from stores where id = st) + 0.005, live_lng = (select store_lng from stores where id = st), live_updated_at = now(), delivery_radius_km = null where driver_id in (drvA, drvB);
  update stores set accepts_pix = true, pix_key = 'loja.teste@pix.com', pix_key_type = 'email' where id = st;
  insert into driver_payout_keys(driver_id, pix_key_type, pix_key) values (drvA, 'email', 'motorista.teste@pix.com');
  select count(*) into before_obl from delivery_obligations;

  -- ===== T52: motorista sem Pix não aceita; cadastro valida e exige consentimento =====
  perform pg_temp.cfg2('{"max_radius_km":5}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid;
  r := pg_temp.try(format('insert into ride_applications(ride_request_id, applicant_id, status, proposed_price) select %L, %L, ''pending'', offered_price from ride_requests where id = %L', ride, drvB, ride));
  res := res || format('T52 motorista sem Pix tenta aceitar: %s | ', r);
  perform pg_temp.as_role(drvB);
  res := res || format('cadastro sem autorizar: %s | ', pg_temp.try('select set_my_payout_pix(''email'', ''x@y.com'', false)'));
  res := res || format('chave invalida: %s | ', pg_temp.try('select set_my_payout_pix(''cpf'', ''123'', true)'));
  w := set_my_payout_pix('phone', '(69) 99999-1234', true);
  reset role;
  res := res || format('cadastro valido: %s %s | ', w->>'registered', w->>'masked');
  perform pg_temp.accept(ride, drvB);
  select status into r from order_delivery_dispatches where id = d; res := res || format('depois de cadastrar o Pix aceitou: %s | ', r);
  -- a chave não é lida por outros
  perform pg_temp.as_role(cust); select count(*) into n from driver_payout_keys; reset role;
  perform pg_temp.as_role(owner); select count(*) into n2 from driver_payout_keys; reset role;
  res := res || format('chaves visiveis ao cliente=%s e a loja (direto)=%s | ', n, n2);

  -- ===== T1-T4: cliente vê total e dados de pagamento da LOJA =====
  x := pg_temp.reserved(cust, drvA); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid; o := (x->>'order')::uuid;
  perform pg_temp.as_role(cust); v := get_delivery_payment_view(d); reset role;
  res := res || format('T1 cliente: estado=%s produtos=%s entrega=%s TOTAL=%s | ', v->>'state', v->>'items_total', v->>'delivery_fee', v->>'total_amount');
  res := res || format('T2 loja: %s Pix %s (%s) | ', v#>>'{store,name}', v#>>'{store,pix_key}', v#>>'{store,pix_key_type}');
  res := res || format('T3 cliente ve Pix do motorista no JSON=%s | ', v::text like '%motorista.teste%');
  begin perform pg_temp.as_role(other); perform get_delivery_payment_view(d); reset role; res := res || 'T4 usuario errado viu(BAD) | '; exception when others then reset role; res := res || 'T4 usuario errado negado | '; end;
  perform pg_temp.as_role(owner); w := get_delivery_payment_view(d); reset role;
  res := res || format('loja antes de receber: Pix do motorista=%s valor a pagar=%s motorista=%s | ', coalesce(w->>'driver_pix_key', 'oculto'), w->>'amount_to_pay_driver', w#>>'{driver,slug}');

  -- ===== T5-T10: loja informa recebimento do cliente =====
  res := res || format('T6 cliente declara pela loja: %s | ', pg_temp.try(format('select 1 from (select pg_temp.as_user(%L)) a, lateral (select set_config(''role'',''authenticated'',true)) b, lateral (select store_report_customer_payment(%L)) c', cust, d)));
  perform pg_temp.as_role(cust); begin perform store_report_customer_payment(d); res := res || 'T6 cliente declarou(BAD) | '; exception when others then res := res || 'T6 cliente nao declara o recebimento da loja | '; end; reset role;
  perform pg_temp.as_role(drvA); begin perform store_report_customer_payment(d); res := res || 'T7 motorista declarou(BAD) | '; exception when others then res := res || 'T7 motorista nao declara pela loja | '; end; reset role;
  perform pg_temp.as_role(owner); w := store_report_customer_payment(d, 'pix'); w := store_report_customer_payment(d, 'pix'); w := store_report_customer_payment(d); reset role;
  select count(*) into n from delivery_payment_events where dispatch_id = d and kind = 'store_declared_customer_payment';
  select phase into r from order_delivery_dispatches where id = d;
  res := res || format('T5/T9/T10 loja informou 3 vezes: eventos=%s fase=%s | ', n, r);
  select amount, metadata->>'method' as method, declared_role into rec from delivery_payment_events where dispatch_id = d and kind = 'store_declared_customer_payment';
  res := res || format('evento: valor=%s metodo=%s por=%s | ', rec.amount, rec.method, rec.declared_role);
  select string_agg(phase_to, ' > ' order by created_at, id) into seq from order_delivery_events where dispatch_id = d and kind = 'phase_change'; res := res || format('fases: %s | ', seq);

  -- ===== T11-T19: loja paga o motorista (declaração) =====
  perform pg_temp.as_role(owner); w := get_delivery_payment_view(d); reset role;
  res := res || format('T11/T12 loja ve: pagar %s ao motorista, Pix %s (%s) | ', w->>'amount_to_pay_driver', w->>'driver_pix_key', w->>'driver_pix_type');
  perform pg_temp.as_role(cust); v := get_delivery_payment_view(d); reset role;
  res := res || format('T13 cliente ve Pix do motorista=%s (chave da loja agora oculta=%s) | ', v::text like '%motorista.teste%', v#>>'{store,pix_key}' is null);
  perform pg_temp.as_role(cust); begin perform store_report_driver_payment(d, 13); res := res || 'T17 cliente declarou pagamento ao motorista(BAD) | '; exception when others then res := res || 'T17 cliente nao declara | '; end; reset role;
  perform pg_temp.as_role(drvA); begin perform store_report_driver_payment(d, 13); res := res || 'T18 motorista declarou pela loja(BAD) | '; exception when others then res := res || 'T18 motorista nao declara pela loja | '; end;
  begin perform driver_report_receipt(d, true); res := res || 'motorista confirmou antes da loja(BAD) | '; exception when others then get stacked diagnostics r = pg_exception_hint; res := res || format('T23 confirmar antes da loja negado(%s) | ', r); end; reset role;
  perform pg_temp.as_role(owner);
  begin perform store_report_driver_payment(d, 12); res := res || 'T16 valor errado aceito(BAD) | '; exception when others then get stacked diagnostics r = pg_exception_hint; res := res || format('T16 valor diferente recusado(%s) | ', r); end;
  w := store_report_driver_payment(d, 13); w := store_report_driver_payment(d, 13);
  reset role;
  select count(*) into n from delivery_payment_events where dispatch_id = d and kind = 'store_declared_driver_payment'; select amount into rec from delivery_payment_events where dispatch_id = d and kind = 'store_declared_driver_payment';
  select phase into r from order_delivery_dispatches where id = d;
  res := res || format('T14/T15/T19 pagamento informado 2 vezes: eventos=%s valor=%s fase=%s | ', n, rec.amount, r);
  -- barreira ainda fechada
  perform pg_temp.as_role(drvA);
  res := res || format('T27 iniciar antes da liberacao: %s | ', pg_temp.try(format('update ride_requests set driver_en_route = true where id = %L', ride)));
  perform pg_temp.as_role(drvA); v := get_delivery_payment_view(d); reset role;
  res := res || format('T20 motorista ve: pode responder=%s valor=%s (total do pedido oculto=%s) | ', v->>'can_respond', v->>'amount_to_receive', v->>'total_amount' is null);
  perform pg_temp.as_role(drvB); begin perform driver_report_receipt(d, true); res := res || 'T21 motorista errado confirmou(BAD) | '; exception when others then res := res || 'T21 motorista errado negado | '; end; reset role;
  perform pg_temp.as_role(owner); begin perform driver_report_receipt(d, true); res := res || 'loja confirmou pelo motorista(BAD) | '; exception when others then res := res || 'loja nao confirma pelo motorista | '; end; reset role;

  -- ===== T22-T28 + T34/T35: motorista confirma e a entrega é liberada =====
  perform pg_temp.as_role(drvA);
  begin perform driver_report_receipt(d, true, 12); res := res || 'valor errado aceito(BAD) | '; exception when others then res := res || 'confirmar com valor diferente recusado | '; end;
  w := driver_report_receipt(d, true, 13); w := driver_report_receipt(d, true); w := driver_report_receipt(d, true, 13);
  reset role;
  select count(*) into n from delivery_payment_events where dispatch_id = d and kind = 'driver_confirmed_receipt'; select amount into rec from delivery_payment_events where dispatch_id = d and kind = 'driver_confirmed_receipt';
  select phase into r from order_delivery_dispatches where id = d;
  select count(*) into n2 from order_delivery_events where dispatch_id = d and kind = 'phase_change' and phase_to = 'ENTREGA_LIBERADA';
  res := res || format('T22/T24/T26/T34/T35 confirmou 3 vezes: eventos=%s valor=%s fase=%s liberacoes=%s | ', n, rec.amount, r, n2);
  select count(*) into n from order_delivery_events where dispatch_id = d and kind = 'phase_change' and phase_to = 'ENTREGADOR_CONFIRMOU_RECEBIMENTO'; res := res || format('T25 passou por ENTREGADOR_CONFIRMOU_RECEBIMENTO=%s | ', n);
  select string_agg(phase_to, ' > ' order by created_at, id) into seq from order_delivery_events where dispatch_id = d and kind = 'phase_change'; res := res || format('fases completas: %s | ', seq);
  perform pg_temp.as_role(drvA);
  res := res || format('T28 iniciar depois da liberacao: %s | ', pg_temp.try(format('update ride_requests set driver_en_route = true, driver_departed_at = now() where id = %L', ride)));
  reset role;
  select count(*) into n from order_delivery_rounds where dispatch_id = d and (platform_fee <> 0 or driver_offer <> final_freight);
  select offered_price into rec from ride_requests where id = ride;
  res := res || format('T42/T43 taxa<>0=%s | frete ao motorista=%s = congelado=%s | ', n, rec.offered_price, (select frozen_freight from order_delivery_dispatches where id = d));
  select count(*) into n from driver_postpaid_charges where ride_request_id = ride or order_id = o; res := res || format('T44 ledger do pedido=%s | ', n);

  -- ===== T29-T32: "não recebi" =====
  x := pg_temp.reserved(cust, drvA); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid;
  perform pg_temp.as_role(owner); w := store_report_customer_payment(d); w := store_report_driver_payment(d, 13); reset role;
  perform pg_temp.as_role(drvA); w := driver_report_receipt(d, false); w := driver_report_receipt(d, false); reset role;
  select phase into r from order_delivery_dispatches where id = d;
  select count(*) into n from delivery_payment_events where dispatch_id = d and kind = 'driver_declared_not_received';
  select count(*) into n2 from delivery_incidents where dispatch_id = d and kind = 'driver_not_received' and status = 'open';
  res := res || format('T29/T30 nao recebi: fase=%s eventos=%s ocorrencias abertas=%s | ', r, n, n2);
  perform pg_temp.as_role(drvA); res := res || format('T31 corrida em verificacao: %s | ', pg_temp.try(format('update ride_requests set driver_en_route = true where id = %L', ride))); reset role;
  perform pg_temp.as_role(owner); w := store_report_driver_payment(d, 13); reset role;
  select phase into r from order_delivery_dispatches where id = d;
  res := res || format('T32 loja repete a declaracao: duplicado=%s fase continua %s | ', w->>'duplicate', r);
  perform pg_temp.as_role(owner); begin update order_delivery_dispatches set phase = 'ENTREGA_LIBERADA' where id = d; get diagnostics n = row_count; res := res || format('loja alterou a fase direto (linhas=%s) | ', n); exception when others then res := res || 'loja nao altera a fase direto | '; end; reset role;
  perform pg_temp.as_role(owner); w := get_delivery_payment_view(d); reset role;
  res := res || format('loja ve divergencia: estado=%s negou=%s ocorrencia=%s | ', w->>'state', w->>'driver_denied', w->>'open_incident');

  -- ===== T8/T36/T37: relógio =====
  x := pg_temp.reserved(cust, drvA); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid;
  update order_delivery_dispatches set reserved_at = now() - interval '10 minutes', reserved_until = now() - interval '1 second' where id = d;
  perform pg_temp.as_role(owner); w := store_report_customer_payment(d); reset role;
  select status, phase into rec from order_delivery_dispatches where id = d; select count(*) into n from delivery_payment_events where dispatch_id = d;
  res := res || format('T8 declaracao tardia: expirou=%s entrega=%s %s eventos de pagamento=%s | ', w->>'expired', rec.status, rec.phase, n);
  x := pg_temp.reserved(cust, drvA); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid;
  update order_delivery_dispatches set reserved_at = now() - interval '10 minutes', reserved_until = now() - interval '1 second' where id = d;
  n := process_delivery_search_v2(); select status, phase into rec from order_delivery_dispatches where id = d;
  res := res || format('T36 sem dinheiro declarado, vencida: %s %s (volta a busca) | ', rec.status, rec.phase);
  x := pg_temp.reserved(cust, drvA); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid;
  perform pg_temp.as_role(owner); w := store_report_customer_payment(d); reset role;
  update order_delivery_dispatches set reserved_at = now() - interval '10 minutes', reserved_until = now() - interval '1 second' where id = d;
  n := process_delivery_search_v2(); n2 := process_delivery_search_v2();
  select status, phase, frozen_freight into rec from order_delivery_dispatches where id = d;
  select driver_id = drvA as ok into r from ride_requests where id = ride;
  select count(*) into n from delivery_incidents where dispatch_id = d and kind = 'operational';
  res := res || format('T37 dinheiro declarado, janela vencida: %s %s congelado=%s motorista continua=%s ocorrencias=%s (job1=%s job2=%s) | ', rec.status, rec.phase, rec.frozen_freight, r, n, n, n2);

  -- ===== T38: cancelamentos depois de dinheiro declarado =====
  x := pg_temp.reserved(cust, drvA); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid;
  perform pg_temp.as_role(owner); w := store_report_customer_payment(d); reset role;
  perform pg_temp.as_role(cust);
  res := res || format('T38 cliente cancela: %s | ', pg_temp.try(format('select cancel_order_delivery(%L)', d)));
  v := null; select open_delivery_incident(d, 'cancellation_contested', 'Quero cancelar, já paguei à loja') into o; reset role;
  perform pg_temp.as_role(drvA); res := res || format('motorista cancela a corrida: %s | ', pg_temp.try(format('update ride_requests set status = ''cancelled'', cancelled_by = ''driver'' where id = %L', ride))); reset role;
  perform pg_temp.as_role(owner); res := res || format('loja cancela a corrida: %s | ', pg_temp.try(format('update ride_requests set status = ''cancelled'', cancelled_by = ''requester'' where id = %L', ride))); reset role;
  select status, phase into rec from order_delivery_dispatches where id = d; select count(*) into n from delivery_incidents where dispatch_id = d and kind = 'cancellation_contested';
  res := res || format('entrega segue %s %s; ocorrencia aberta pelo cliente=%s | ', rec.status, rec.phase, n);
  perform pg_temp.as_role(cust); w := to_jsonb(open_delivery_incident(d, 'cancellation_contested', 'Quero cancelar, já paguei à loja')); reset role;
  select count(*) into n from delivery_incidents where dispatch_id = d and kind = 'cancellation_contested'; res := res || format('ocorrencia repetida (idempotente)=%s | ', n);

  -- ===== dinheiro / custódia =====
  select count(*) into n from delivery_obligations; select count(*) into n2 from delivery_payment_events where coalesce(metadata->>'declaratory', 'true') <> 'true' and kind <> 'sent_for_verification';
  res := res || format('T39 obrigacoes novas=%s | T40 eventos nao declaratorios=%s | ', n - before_obl, n2);
  raise exception 'RESULT: %', res;
end $$;
