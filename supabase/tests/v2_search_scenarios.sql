-- Etapa 2.5: cenários da busca dinâmica V2 (estratégias, limites, autorização, aceite, idempotência, cancelamento, segurança).
-- MODO DE TESTE: transação desfeita; remove os CHECKs e liga as chaves V2 só ali dentro; pings desligados (app.skip_delivery_ping).
-- Rodar: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/tests/v2_search_scenarios.sql
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
do $$
declare st uuid := '93e432b4-0472-4ae4-abb1-45b516e2f7bd';
  cust uuid; other uuid; owner uuid; drvA uuid; drvB uuid; res text := ''; x jsonb; d uuid; ride uuid; o uuid;
  rec record; n int; n2 int; r text; seq text; hint text; sa text; sb text; lat0 double precision; lng0 double precision; i int; a uuid; before_round int;
begin
  select id into cust from auth.users where email = 'usuarioteste@gmail.com';
  select id into other from profiles where "profileSlug" = 'lucy';
  select owner_id, store_lat, store_lng into owner, lat0, lng0 from stores where id = st;
  select id into drvA from profiles where "profileSlug" = 'natancastelano';
  select driver_id into drvB from driver_pricing where driver_id not in (cust, other, owner, drvA) order by driver_id limit 1;
  insert into driver_payout_keys(driver_id, pix_key_type, pix_key) values (drvA, 'email', 'a.teste@pix.com'), (drvB, 'email', 'b.teste@pix.com') on conflict do nothing;   -- V2 exige Pix do motorista (2.7)
  if drvB is null then raise exception 'RESULT: sem segundo motorista de teste com driver_pricing'; end if;

  -- ===== T1/T2: primeira oferta = estimativa, raio inicial, taxa 0 =====
  perform pg_temp.cfg();
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid;
  select * into rec from order_delivery_dispatches where id = d;
  res := res || format('T1 estimada=%s oferta=%s original=%s congelado=%s fase=%s limite_automatico=%s | ', rec.estimated_freight, rec.final_freight, rec.original_freight, coalesce(rec.frozen_freight::text,'NULL'), rec.phase, rec.price_limit);
  select r1.kind, r1.action, r1.strategy, r1.final_freight as ff, r1.platform_fee as pf, r1.driver_offer as dof, r1.radius_km as rk, (r1.offer_expires_at is not null) as hasexp into rec from order_delivery_rounds r1 where dispatch_id = d and round = 1;
  res := res || format('T1 rodada1: kind=%s acao=%s estrategia=%s valor=%s taxa=%s motorista=%s | ', rec.kind, rec.action, rec.strategy, rec.ff, rec.pf, rec.dof);
  select offered_price, visible_radius_km into rec from ride_requests where id = ride;
  res := res || format('T2 raio inicial: corrida=%s km, oferta ao motorista=%s | ', rec.visible_radius_km, rec.offered_price);
  select count(*) into n from order_delivery_events where dispatch_id = d and kind = 'round_started' and processed_at is null;
  res := res || format('(aviso da rodada 1 na fila=%s) | ', n);

  -- ===== T4/T5: EXPANDIR_RAIO_PRIMEIRO, passo 3 km, máximo 11 =====
  perform pg_temp.cfg('{"search_strategy":"EXPANDIR_RAIO_PRIMEIRO","max_radius_km":11}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; seq := pg_temp.st(d);
  for i in 1..5 loop r := pg_temp.step(d); seq := seq || ' => ' || r || ' ' || pg_temp.st(d); end loop;
  res := res || format('T4/T5/T19 A(raio primeiro, max 11): %s | ', seq);

  -- ===== T6/T9/T20: AUMENTAR_PRECO_PRIMEIRO, +R$1, limite automático R$3 (=15), raio até 11 =====
  perform pg_temp.cfg('{"search_strategy":"AUMENTAR_PRECO_PRIMEIRO","max_radius_km":11}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; seq := pg_temp.st(d);
  for i in 1..6 loop r := pg_temp.step(d); seq := seq || ' => ' || r || ' ' || pg_temp.st(d); end loop;
  res := res || format('T6/T10/T12/T13/T20 B(preco primeiro): %s | ', seq);
  select count(*) into n from delivery_reajust_authorizations where dispatch_id = d;
  res := res || format('(autorizacoes=%s) | ', n);

  -- ===== T21: RAIO_E_PRECO_SIMULTANEAMENTE =====
  perform pg_temp.cfg('{"max_radius_km":14}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; seq := pg_temp.st(d);
  for i in 1..5 loop r := pg_temp.step(d); seq := seq || ' => ' || r || ' ' || pg_temp.st(d); end loop;
  res := res || format('T21 C(simultaneo, max 14): %s | ', seq);
  select * into rec from delivery_reajust_authorizations where dispatch_id = d and status = 'pending';
  res := res || format('T13 autorizacao: estimativa=%s oferta=%s limite_anterior=%s novo_limite=%s expira_em_min=%s | ', rec.estimated_freight, rec.current_offer, rec.previous_limit, rec.requested_limit, round(extract(epoch from (rec.expires_at - now()))/60));
  a := rec.id;
  -- T14/T36/T37 durante a espera: nada sobe, nada duplica
  select final_freight into rec from order_delivery_dispatches where id = d; r := rec.final_freight::text;
  perform pg_temp.expire(d); perform pg_temp.age_price(d);
  res := res || format('T14 passo durante espera=%s ', _advance_delivery_search_v2(d));
  perform process_delivery_search_v2(); perform process_delivery_search_v2();
  select final_freight into rec from order_delivery_dispatches where id = d;
  res := res || format('oferta antes=%s depois=%s | ', r, rec.final_freight);
  select count(*) into n from delivery_reajust_authorizations where dispatch_id = d; select count(*) into n2 from order_delivery_events where dispatch_id = d and kind = 'reajust_requested';
  res := res || format('T36 autorizacoes=%s pedidos_na_fila=%s | ', n, n2);

  -- T16 usuários errados
  perform pg_temp.as_user(other); set local role authenticated;
  begin perform respond_delivery_reajust(a, true); res := res || 'T16 outro usuario autorizou(BAD) | ';
  exception when others then res := res || 'T16 outro usuario negado | '; end;
  reset role;
  perform pg_temp.as_user(owner); set local role authenticated;
  begin perform respond_delivery_reajust(a, true); res := res || 'loja autorizou(BAD) | ';
  exception when others then res := res || 'loja nao autoriza pelo cliente | '; end;
  reset role;
  perform pg_temp.as_user(cust); set local role authenticated;
  begin update delivery_reajust_authorizations set status = 'authorized' where id = a; get diagnostics n = row_count; res := res || format('cliente update direto da autorizacao afetou %s | ', n);
  exception when others then res := res || 'cliente update direto da autorizacao negado | '; end;
  begin update order_delivery_dispatches set price_limit = 999, final_freight = 999 where id = d; get diagnostics n = row_count; res := res || format('cliente alterou limite/oferta (linhas=%s) | ', n);
  exception when others then res := res || 'cliente nao altera limite/oferta | '; end;
  begin perform process_delivery_search_v2(); res := res || 'cliente rodou o motor(BAD) | ';
  exception when others then res := res || 'cliente nao roda o motor | '; end;
  reset role;
  -- T15 cliente correto autoriza
  perform pg_temp.as_user(cust); set local role authenticated;
  x := respond_delivery_reajust(a, true);
  reset role;
  select * into rec from order_delivery_dispatches where id = d;
  res := res || format('T15 autorizou: %s limite=%s fase=%s | ', pg_temp.st(d), rec.price_limit, rec.phase);
  select offered_price into rec from ride_requests where id = ride; select offered_price into rec from ride_requests where id = (select ride_request_id from order_delivery_dispatches where id = d);
  res := res || format('(oferta ao motorista=%s) | ', rec.offered_price);
  begin perform respond_delivery_reajust(a, true); res := res || 'reuso da autorizacao(BAD) | '; exception when others then res := res || 'autorizacao ja decidida nao repete | '; end;

  -- ===== T17: cliente recusa =====
  perform pg_temp.cfg('{"max_radius_km":5,"max_price_adjustments":1}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid;
  perform pg_temp.cfg('{"max_radius_km":5,"max_price_adjustments":2,"auto_increase_cap_amount":1}');
  update order_delivery_dispatches set price_limit = 13 where id = d;
  r := pg_temp.step(d); r := pg_temp.step(d);                          -- 13 (dentro do limite) e depois pede autorização
  select id into a from delivery_reajust_authorizations where dispatch_id = d and status = 'pending';
  perform pg_temp.as_user(cust); set local role authenticated; x := respond_delivery_reajust(a, false); reset role;
  select status, phase, search_end_reason, final_freight into rec from order_delivery_dispatches where id = d;
  res := res || format('T17 recusou: status=%s fase=%s motivo=%s oferta=%s | ', rec.status, rec.phase, rec.search_end_reason, rec.final_freight);
  select status into rec from ride_requests where id = ride; res := res || format('(corrida=%s) | ', rec.status);

  -- ===== T18: autorização expira =====
  perform pg_temp.cfg('{"max_radius_km":5,"max_price_adjustments":2,"auto_increase_cap_amount":1}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid;
  r := pg_temp.step(d); r := pg_temp.step(d);
  alter table delivery_reajust_authorizations disable trigger dra_no_edit;
  update delivery_reajust_authorizations set expires_at = now() - interval '1 minute' where dispatch_id = d and status = 'pending';
  alter table delivery_reajust_authorizations enable trigger dra_no_edit;
  r := _advance_delivery_search_v2(d);
  select status, phase, search_end_reason, final_freight into rec from order_delivery_dispatches where id = d;
  select status into sa from delivery_reajust_authorizations where dispatch_id = d order by requested_at desc limit 1;
  res := res || format('T18 expirou: %s status=%s fase=%s motivo=%s oferta=%s autorizacao=%s | ', r, rec.status, rec.phase, rec.search_end_reason, rec.final_freight, sa);

  -- ===== T7/T8: percentual e arredondamento =====
  perform pg_temp.cfg('{"search_strategy":"AUMENTAR_PRECO_PRIMEIRO","increase_kind":"percent","increase_value":10,"auto_increase_cap_amount":null,"auto_increase_cap_percent":100}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; seq := '';
  for i in 1..3 loop r := pg_temp.step(d); seq := seq || (select final_freight::text from order_delivery_dispatches where id = d) || ' '; end loop;
  res := res || format('T7 percentual 10%% sobre a oferta atual: %s | ', seq);
  perform pg_temp.cfg('{"search_strategy":"AUMENTAR_PRECO_PRIMEIRO","increase_kind":"percent","increase_value":10,"auto_increase_cap_amount":null,"auto_increase_cap_percent":100,"freight_rounding_step":0.5,"freight_rounding_mode":"NEAREST"}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; r := pg_temp.step(d); select final_freight into rec from order_delivery_dispatches where id = d; sa := rec.final_freight::text;
  perform pg_temp.cfg('{"search_strategy":"AUMENTAR_PRECO_PRIMEIRO","increase_kind":"percent","increase_value":10,"auto_increase_cap_amount":null,"auto_increase_cap_percent":100,"freight_rounding_step":0.5,"freight_rounding_mode":"UP"}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; r := pg_temp.step(d); select final_freight into rec from order_delivery_dispatches where id = d;
  res := res || format('T8 12 +10%% passo 0,50: NEAREST=%s UP=%s | ', sa, rec.final_freight);

  -- ===== T9: teto absoluto =====
  perform pg_temp.cfg('{"search_strategy":"AUMENTAR_PRECO_PRIMEIRO","max_freight":14,"increase_value":1.5,"auto_increase_cap_amount":null,"max_radius_km":5}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; seq := pg_temp.st(d);
  for i in 1..4 loop r := pg_temp.step(d); seq := seq || ' => ' || r || ' ' || pg_temp.st(d); end loop;
  res := res || format('T9 teto 14: %s | ', seq);

  -- ===== T11: limite automático em % (25%% de 12 = 15) =====
  perform pg_temp.cfg('{"search_strategy":"AUMENTAR_PRECO_PRIMEIRO","auto_increase_cap_amount":null,"auto_increase_cap_percent":25,"max_radius_km":5}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; seq := '';
  for i in 1..4 loop r := pg_temp.step(d); seq := seq || r || ' ' || (select final_freight::text from order_delivery_dispatches where id = d) || ' / '; end loop;
  select price_limit into rec from order_delivery_dispatches where id = d;
  res := res || format('T11 limite 25%%: limite=%s %s | ', rec.price_limit, seq);

  -- ===== T22/T23/T24 =====
  perform pg_temp.cfg('{"max_rounds":3}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid;
  r := pg_temp.step(d); r := pg_temp.step(d); r := pg_temp.step(d);
  select status, phase, search_end_reason, round into rec from order_delivery_dispatches where id = d;
  res := res || format('T22 max 3 rodadas: %s fase=%s motivo=%s rodadas=%s | ', rec.status, rec.phase, rec.search_end_reason, rec.round);
  perform pg_temp.cfg();
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid;
  update order_delivery_dispatches set created_at = now() - interval '31 minutes' where id = d;
  r := pg_temp.step(d); select status, phase, search_end_reason into rec from order_delivery_dispatches where id = d;
  res := res || format('T23 tempo total: %s fase=%s motivo=%s | ', r, rec.phase, rec.search_end_reason);
  perform pg_temp.cfg('{"max_radius_km":5,"max_price_adjustments":1}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; seq := '';
  for i in 1..3 loop r := pg_temp.step(d); seq := seq || r || ' / '; end loop;
  select status, phase, search_end_reason into rec from order_delivery_dispatches where id = d;
  res := res || format('T24 sem alternativas: %s fase=%s motivo=%s | ', seq, rec.phase, rec.search_end_reason);

  -- ===== hold + histórico + notificações + cron repetido (T34-T39) =====
  perform pg_temp.cfg('{"search_strategy":"EXPANDIR_RAIO_PRIMEIRO","max_radius_km":8,"price_adjust_interval_minutes":60}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid;
  perform pg_temp.expire(d); r := _advance_delivery_search_v2(d);                 -- raio 8
  perform pg_temp.expire(d); r := _advance_delivery_search_v2(d);                 -- raio no máximo e intervalo do preço não passou: manter
  res := res || format('hold: %s | ', r);
  select round into before_round from order_delivery_dispatches where id = d;
  perform pg_temp.expire(d); update order_delivery_dispatches set offer_expires_at = now() - interval '1 second' where id = d;
  r := _advance_delivery_search_v2(d); r := _advance_delivery_search_v2(d); r := _advance_delivery_search_v2(d);   -- repetido: só a primeira cria rodada
  select round into n from order_delivery_dispatches where id = d;
  res := res || format('T34/T35 3 chamadas seguidas: rodada %s -> %s | ', before_round, n);
  update order_delivery_dispatches set offer_expires_at = now() - interval '1 second' where id = d;
  n := process_delivery_search_v2(); n2 := process_delivery_search_v2();
  res := res || format('T34 cron duas vezes: %s e %s rodadas criadas | ', n, n2);
  select count(*) into n from (select dispatch_id, round_id from order_delivery_events where dispatch_id = d and kind = 'round_started' group by 1,2 having count(*) > 1) q;
  res := res || format('T37 rodadas com aviso duplicado=%s | ', n);
  perform record_delivery_round_notified(d, 7);
  select notified_count into rec from order_delivery_rounds where dispatch_id = d and round = (select round from order_delivery_dispatches where id = d);
  res := res || format('T39 notified_count=%s | ', rec.notified_count);
  select string_agg(format('R%s %skm R$%s %s %s%s', round, radius_km, final_freight, action, status, case when automatic then '' else ' (autorizada)' end), ' ; ' order by round) into seq from order_delivery_rounds where dispatch_id = d;
  res := res || format('T38 historico: %s | ', seq);
  -- V1 não toca V2
  select round into before_round from order_delivery_dispatches where id = d;
  update order_delivery_dispatches set round_started_at = now() - interval '2 hours' where id = d;
  perform process_order_delivery_dispatches();
  select round into n from order_delivery_dispatches where id = d; res := res || format('cron V1 com V2 pendente: rodada %s -> %s | ', before_round, n);

  -- ===== T25..T33: aceite =====
  perform pg_temp.cfg('{"max_radius_km":5}');
  update driver_pricing set live_lat = lat0 + 0.005, live_lng = lng0, live_updated_at = now(), delivery_radius_km = null where driver_id = drvA;
  update driver_pricing set live_lat = lat0 + 0.11, live_lng = lng0, live_updated_at = now(), delivery_radius_km = null where driver_id = drvB;
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid; o := (x->>'order')::uuid;
  r := pg_temp.step(d);                                              -- 13
  select final_freight into rec from order_delivery_dispatches where id = d; res := res || format('oferta antes do aceite=%s | ', rec.final_freight);
  begin insert into ride_applications(ride_request_id, applicant_id, status, proposed_price) values (ride, drvA, 'pending', 12); res := res || 'T29 aceite de oferta antiga(BAD) | ';
  exception when others then get stacked diagnostics hint = pg_exception_hint; res := res || format('T29 oferta antiga recusada(%s) | ', hint); end;
  update order_delivery_dispatches set offer_expires_at = now() - interval '1 second' where id = d;
  begin insert into ride_applications(ride_request_id, applicant_id, status, proposed_price) values (ride, drvA, 'pending', 13); res := res || 'T30 aceite de rodada expirada(BAD) | ';
  exception when others then get stacked diagnostics hint = pg_exception_hint; res := res || format('T30 rodada expirada recusada(%s) | ', hint); end;
  update order_delivery_dispatches set offer_expires_at = now() + interval '1 minute' where id = d;
  begin insert into ride_applications(ride_request_id, applicant_id, status, proposed_price) values (ride, drvB, 'pending', 13); res := res || 'T3 motorista fora do raio aceitou(BAD) | ';
  exception when others then res := res || 'T3 motorista fora do raio recusado | '; end;
  insert into ride_applications(ride_request_id, applicant_id, status, proposed_price) values (ride, drvA, 'pending', 13);
  select * into rec from order_delivery_dispatches where id = d;
  res := res || format('T25/T26 aceite: status=%s fase=%s frozen=%s oferta=%s estimada=%s | ', rec.status, rec.phase, rec.frozen_freight, rec.final_freight, rec.estimated_freight);
  select offered_price, driver_id = drvA as ok, status into rec from ride_requests where id = ride;
  res := res || format('T27 valor ao motorista=%s motorista_certo=%s corrida=%s | ', rec.offered_price, rec.ok, rec.status);
  select count(*) into n from driver_postpaid_charges where ride_request_id = ride or order_id = o; select platform_fee, driver_offer into rec from order_delivery_rounds where dispatch_id = d order by round desc limit 1;
  res := res || format('T28 taxa da plataforma na rodada=%s motorista na rodada=%s cobrancas_do_ledger=%s | ', rec.platform_fee, rec.driver_offer, n);
  select status into sa from order_delivery_rounds where dispatch_id = d order by round desc limit 1;
  update driver_pricing set live_lat = lat0 + 0.004, live_updated_at = now() where driver_id = drvB;      -- agora dentro do raio: o 2o candidato tenta o mesmo valor
  insert into ride_applications(ride_request_id, applicant_id, status, proposed_price) values (ride, drvB, 'pending', 13);
  select frozen_freight, final_freight into rec from order_delivery_dispatches where id = d;
  select count(*) filter (where status = 'accepted'), count(*) filter (where status = 'rejected') into n, n2 from ride_applications where ride_request_id = ride;
  res := res || format('T33 apos 2o candidato: frozen=%s aceitas=%s rejeitadas=%s rodada=%s | ', rec.frozen_freight, n, n2, sa);
  begin update order_delivery_dispatches set final_freight = 20 where id = d; res := res || 'oferta mudou apos aceite(BAD) | '; exception when others then res := res || 'oferta nao muda apos aceite | '; end;
  begin update order_delivery_dispatches set frozen_freight = 1 where id = d; res := res || 'frozen mudou(BAD) | '; exception when others then res := res || 'frozen nao muda | '; end;
  perform pg_temp.as_user(drvA); set local role authenticated;
  begin update order_delivery_dispatches set frozen_freight = 1 where id = d; get diagnostics n = row_count; res := res || format('motorista alterou frozen (linhas=%s) | ', n);
  exception when others then res := res || 'motorista nao altera frozen | '; end;
  begin update ride_requests set offered_price = 999 where id = ride; res := res || 'motorista alterou preco(BAD) | ';
  exception when others then res := res || 'motorista nao altera o preco da corrida | '; end;
  reset role;

  -- T31: oferta acima do limite autorizado é impossível
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid;
  begin update order_delivery_dispatches set final_freight = (select price_limit + 1 from order_delivery_dispatches where id = d) where id = d; res := res || 'T31 oferta acima do limite(BAD) | ';
  exception when insufficient_privilege then res := res || 'T31 oferta acima do limite autorizado recusada | '; end;

  -- T40: cancelamento interrompe a busca (inclusive esperando autorização)
  perform pg_temp.cfg('{"max_radius_km":5,"max_price_adjustments":2,"auto_increase_cap_amount":1}');
  x := pg_temp.mk(12, cust); d := (x->>'dispatch')::uuid; ride := (x->>'ride')::uuid;
  r := pg_temp.step(d); r := pg_temp.step(d);
  perform pg_temp.as_user(cust); set local role authenticated; perform cancel_order_delivery(d); reset role;
  select status, phase, search_end_reason into rec from order_delivery_dispatches where id = d;
  select status into sa from delivery_reajust_authorizations where dispatch_id = d order by requested_at desc limit 1;
  res := res || format('T40 cancelado: status=%s fase=%s motivo=%s autorizacao=%s motor=%s | ', rec.status, rec.phase, rec.search_end_reason, sa, _advance_delivery_search_v2(d));

  -- Minha tarifa desativada no V2
  begin perform create_delivery_counter(ride, drvA, 20); res := res || 'contraproposta V2 aceita(BAD) | ';
  exception when others then res := res || 'contraproposta no V2 desativada | '; end;

  -- estado
  select new_delivery_flow_enabled into sa from delivery_dispatch_settings;
  raise exception 'RESULT: %', res;
end $$;
