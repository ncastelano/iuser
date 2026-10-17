-- Etapa 2.4.1: semântica do frete V2 (estimada / oferta atual / congelado), cerca contra a máquina do V1 e imutabilidade.
-- MODO DE TESTE: transação desfeita; remove os CHECKs e liga as chaves V2 só ali dentro. Roda depois das migrations 20261098/99.
-- Rodar: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/tests/freight_semantics_scenarios.sql
-- ===== modo de teste (só nesta transação, desfeita): liga as chaves V2 =====
alter table public.delivery_dispatch_settings drop constraint dds_new_flow_inactive_check;
alter table public.store_delivery_flow drop constraint store_delivery_flow_inactive_check;
update public.delivery_dispatch_settings set new_delivery_flow_enabled = true;
update public.store_delivery_flow set v2_enabled = true where store_id = '93e432b4-0472-4ae4-abb1-45b516e2f7bd';
create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true); end $f$;
do $$
declare st uuid := '93e432b4-0472-4ae4-abb1-45b516e2f7bd'; prod uuid := 'bdf2d5b5-3879-4c8f-bd9a-6a6241b24570';
  cust uuid; owner uuid; drv uuid; res text := ''; addr text := 'Rua Dom Pedro II, 800, Porto Velho'; lat double precision := -8.763734; lng double precision := -63.909044;
  est jsonb; j jsonb; o uuid; d uuid; ride uuid; rec record; n int; n2 int; items jsonb;
begin
  select id into cust from auth.users where email = 'usuarioteste@gmail.com';
  select owner_id into owner from stores where id = st;
  select id into drv from profiles where "profileSlug" = 'natancastelano';
  items := jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 1));
  est := record_delivery_estimate(cust, st, lat, lng, 5017, 'route', 'verified', addr);
  perform pg_temp.as_user(cust); set local role authenticated;
  j := create_store_order(st, items, 'entrega', 'pix', addr, lat, lng, null, null, null, null, (est->>'estimate_id')::uuid);
  reset role; o := (j->>'order_id')::uuid;
  perform pg_temp.as_user(owner); set local role authenticated; update orders set status = 'preparing' where id = o; reset role;
  select * into rec from order_delivery_dispatches where order_id = o; d := rec.id; ride := rec.ride_request_id;
  res := res || format('T5 ao nascer: estimada=%s oferta(final)=%s original=%s congelado=%s | ', rec.estimated_freight, rec.final_freight, rec.original_freight, coalesce(rec.frozen_freight::text,'NULL'));
  select offered_price into rec from ride_requests where id = ride; res := res || format('(offered_price do motorista=%s) | ', rec.offered_price);
  -- cliente/loja nao congelam antes do aceite
  begin update order_delivery_dispatches set frozen_freight = 1, freight_frozen_at = now() where id = d; res := res||'congelou antes do aceite(BAD) | ';
  exception when insufficient_privilege then res := res || 'congelar antes do aceite negado | '; end;
  -- T6 oferta sobe (simulada): estimada nao muda
  update order_delivery_dispatches set final_freight = 9 where id = d; update order_delivery_dispatches set final_freight = 10 where id = d;
  select estimated_freight, final_freight, frozen_freight into rec from order_delivery_dispatches where id = d;
  res := res || format('T6 apos oferta 9 e 10: estimada=%s oferta=%s congelado=%s | ', rec.estimated_freight, rec.final_freight, coalesce(rec.frozen_freight::text,'NULL'));
  -- maquina do V1 nao toca V2: rodada de reajuste negada e cron ignora a linha
  begin insert into order_delivery_rounds(dispatch_id, round, kind, original_freight, extra, final_freight, platform_fee, driver_offer, radius_km, status) values (d, 2, 'increase', 8.03, 1.97, 10, 0, 10, 8, 'pending_customer'); res := res||'rodada de reajuste V2 aceita(BAD) | ';
  exception when insufficient_privilege then res := res || 'rodada de reajuste no V2 negada | '; end;
  update order_delivery_dispatches set round_started_at = now() - interval '2 hours' where id = d;
  select count(*) into n from order_delivery_rounds where dispatch_id = d;
  perform process_order_delivery_dispatches();
  select count(*) into n2 from order_delivery_rounds where dispatch_id = d; res := res || format('cron: rodadas antes=%s depois=%s | ', n, n2);
  -- T7 aceite (motorista se candidata; o servidor aceita): congela EXATAMENTE a oferta vigente
  insert into ride_applications(ride_request_id, applicant_id, status, proposed_price) select ride, drv, 'pending', offered_price from ride_requests where id = ride;
  select status, frozen_freight, final_freight, estimated_freight, freight_frozen_at is not null as ts into rec from order_delivery_dispatches where id = d;
  res := res || format('T7 aceite: status=%s congelado=%s oferta=%s estimada=%s data=%s | ', rec.status, rec.frozen_freight, rec.final_freight, rec.estimated_freight, rec.ts);
  select count(*) into n from order_delivery_events where dispatch_id = d and kind = 'freight_frozen'; res := res || format('(evento freight_frozen=%s) | ', n);
  -- T8 depois do aceite: nada mexe no congelado nem na oferta
  begin update order_delivery_dispatches set frozen_freight = 99 where id = d; res := res||'mudou congelado(BAD) | ';
  exception when insufficient_privilege then res := res || 'T8 mudar congelado negado | '; end;
  begin update order_delivery_dispatches set frozen_freight = null where id = d; res := res||'zerou congelado(BAD) | ';
  exception when insufficient_privilege then res := res || 'zerar congelado negado | '; end;
  begin update order_delivery_dispatches set final_freight = 20 where id = d; res := res||'mudou oferta apos congelar(BAD) | ';
  exception when insufficient_privilege then res := res || 'mudar oferta apos congelar negado | '; end;
  begin update order_delivery_dispatches set estimated_freight = 20 where id = d; res := res||'mudou estimada(BAD) | ';
  exception when insufficient_privilege then res := res || 'mudar estimada negado | '; end;
  -- clientes pelo app nao escrevem na entrega
  perform pg_temp.as_user(cust); set local role authenticated;
  begin update order_delivery_dispatches set frozen_freight = 1 where id = d; get diagnostics n = row_count; res := res || format('cliente update direto afetou %s | ', n);
  exception when others then res := res || 'cliente update direto negado | '; end;
  reset role;
  -- evento de criacao sem original_freight no V2
  select (data ? 'original_freight') and data->>'original_freight' is not null as tem into rec from order_delivery_events where dispatch_id = d and kind = 'estimate_recorded';
  res := res || format('(evento de criacao V2 traz original_freight=%s) | ', rec.tem);
  raise exception 'RESULT: %', res;
end $$;
