-- Regressão do fluxo V1 (pedido → loja aceita → entrega → candidaturas → conclusão → cobranças R$ 0,50) + privacidade.
-- Transação desfeita (RAISE no fim mostra o resultado). Com as chaves V2 FALSE (produção) o pedido nasce V1.
-- Rodar: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/tests/v1_regression.sql
select set_config('app.skip_delivery_ping', '1', true);
create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true); end $f$;
do $$
declare st uuid := '93e432b4-0472-4ae4-abb1-45b516e2f7bd'; prod uuid := 'bdf2d5b5-3879-4c8f-bd9a-6a6241b24570';
  cust uuid; owner uuid; drv uuid; d2 uuid; d3 uuid; j jsonb; o uuid; ride uuid; d uuid; rec record; n int; n2 int; res text := '';
begin
  select id into cust from profiles where "profileSlug" = 'lucy';
  select owner_id into owner from stores where id = st;
  select id into drv from profiles where "profileSlug" = 'natancastelano';
  select driver_id into d2 from driver_pricing where driver_id not in (cust, owner, drv) order by driver_id limit 1;
  select driver_id into d3 from driver_pricing where driver_id not in (cust, owner, drv, d2) order by driver_id limit 1;
  if d3 is null then select id into d3 from profiles where id not in (cust, owner, drv, d2) order by id limit 1; end if;
  perform pg_temp.as_user(cust); set local role authenticated;
  j := create_store_order(st, jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 2)), 'entrega', 'pix', 'Rua Dom Pedro II, 800, Porto Velho', -8.7860, -63.8760, null, null, null, null);
  reset role; o := (j->>'order_id')::uuid;
  res := res || format('V1 pedido: total=%s frete=%s versao=%s | ', j->>'total_amount', j->>'delivery_fee', j->>'flow_version');
  perform pg_temp.as_user(owner); set local role authenticated; update orders set status = 'preparing' where id = o; reset role;
  select * into rec from order_delivery_dispatches where order_id = o; d := rec.id; ride := rec.ride_request_id;
  res := res || format('entrega V1: flow=%s status=%s fase=%s estimada=%s oferta=%s | ', rec.flow_version, rec.status, rec.phase, rec.estimated_freight, rec.final_freight);
  perform pg_temp.as_user(drv); set local role authenticated;
  select count(*) into n from ride_offers where id = ride; select count(*) into n2 from ride_requests where id = ride;
  res := res || format('motorista nao vinculado: ve a oferta=%s, ve ride_requests=%s | ', n, n2);
  update ride_requests set offered_price = 99 where id = ride; get diagnostics n = row_count; res := res || format('alterar preco afetou %s linhas | ', n);
  reset role;
  insert into ride_applications(ride_request_id, applicant_id, status, proposed_price) select ride, drv, 'pending', offered_price from ride_requests where id = ride;
  insert into ride_applications(ride_request_id, applicant_id, status, proposed_price) select ride, d2, 'pending', offered_price from ride_requests where id = ride;
  insert into ride_applications(ride_request_id, applicant_id, status, proposed_price) select ride, d3, 'pending', offered_price from ride_requests where id = ride;
  select count(*) filter (where status = 'accepted'), count(*) filter (where status = 'rejected') into n, n2 from ride_applications where ride_request_id = ride;
  res := res || format('candidaturas: aceitas=%s rejeitadas=%s | ', n, n2);
  perform pg_temp.as_user(drv); set local role authenticated;
  begin update ride_requests set status = 'completed' where id = ride; res := res || 'concluir direto(BAD) | '; exception when others then res := res || 'concluir direto negado | '; end;
  update ride_requests set driver_departed_at = now() where id = ride; update ride_requests set driver_arrived_at = now() where id = ride; update ride_requests set ride_started_at = now() where id = ride;
  perform complete_ride(ride, -8.7860, -63.8760);
  reset role;
  select status into rec from orders where id = o; res := res || format('pedido=%s ', rec.status);
  select status into rec from order_delivery_dispatches where id = d; res := res || format('entrega=%s | ', rec.status);
  select frozen_freight, final_freight into rec from order_delivery_dispatches where id = d; res := res || format('V1 congelado=%s oferta=%s | ', rec.frozen_freight, rec.final_freight);
  select count(*) into n from driver_postpaid_charges where ride_request_id = ride and amount = 0.5; select count(*) into n2 from driver_postpaid_charges where order_id = o and amount = 0.5;
  res := res || format('R$0,50 corrida=%s R$0,50 pedido=%s | ', n, n2);
  select length(share_token) into n from ride_requests where id = ride; res := res || format('share_token=%s caracteres | ', n);
  select new_delivery_flow_enabled into rec from delivery_dispatch_settings; res := res || format('global V2=%s | ', rec.new_delivery_flow_enabled);
  raise exception 'RESULT: %', res;
end $$;
