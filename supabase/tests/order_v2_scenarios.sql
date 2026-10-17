-- Etapa 2.4: cenários do pedido V2 (estimativa vinculada, recusa/aceite da loja, adulteração, cancelamento, limpeza).
-- MODO DE TESTE: dentro da transação (desfeita no fim) remove os CHECKs e liga as chaves V2; em produção as chaves seguem FALSE.
-- Rodar: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/tests/order_v2_scenarios.sql
-- ===== modo de teste (só dentro desta transação, que é desfeita): liga as chaves V2 =====
alter table public.delivery_dispatch_settings drop constraint dds_new_flow_inactive_check;
alter table public.store_delivery_flow drop constraint store_delivery_flow_inactive_check;
update public.delivery_dispatch_settings set new_delivery_flow_enabled = true;
update public.store_delivery_flow set v2_enabled = true where store_id = '93e432b4-0472-4ae4-abb1-45b516e2f7bd';

create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true); end $f$;

do $$
declare st uuid := '93e432b4-0472-4ae4-abb1-45b516e2f7bd'; prod uuid := 'bdf2d5b5-3879-4c8f-bd9a-6a6241b24570';
  cust uuid; other uuid; owner uuid; st2 uuid; res text := '';
  addr text := 'Rua Dom Pedro II, 800, Porto Velho'; lat double precision := -8.763734; lng double precision := -63.909044;
  est jsonb; est2 jsonb; j jsonb; o uuid; o2 uuid; hint text; n int; x text; pr numeric; rec record; d uuid;
  items jsonb; bl boolean; c1 int; c2 int; c3 int;
begin
  select id into cust from auth.users where email = 'usuarioteste@gmail.com';
  select id into other from profiles where "profileSlug" = 'lucy';
  select owner_id into owner from stores where id = st;
  select id into st2 from stores where id <> st limit 1;
  select p.price into pr from products p where p.id = prod;
  items := jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 2));

  -- T1 estimativa valida
  est := record_delivery_estimate(cust, st, lat, lng, 5017, 'route', 'verified', addr);
  res := res || format('T1 estimativa=%s frete=%s | ', left(est->>'estimate_id', 8), est->>'estimated_freight');

  -- T2..T5 pedido V2 com a estimativa
  perform pg_temp.as_user(cust); set local role authenticated;
  j := create_store_order(st, items, 'entrega', 'pix', addr, lat, lng, null, null, null, null, (est->>'estimate_id')::uuid);
  reset role; o := (j->>'order_id')::uuid;
  res := res || format('T2 pedido V2 flow=%s | ', j->>'flow_version');
  res := res || format('T3 produtos=%s (esperado %s) | ', j->>'items_total', pr * 2);
  res := res || format('T4 frete=%s (estimativa %s) | ', j->>'delivery_fee', est->>'estimated_freight');
  res := res || format('T5 total=%s (esperado %s) | ', j->>'total_amount', pr * 2 + (est->>'estimated_freight')::numeric);
  select status, payment_method, delivery_flow_version into rec from orders where id = o;
  res := res || format('(status=%s pagamento=%s versao=%s) | ', rec.status, rec.payment_method, rec.delivery_flow_version);
  select count(*) into n from order_delivery_dispatches where order_id = o; res := res || format('T14 dispatch antes do aceite=%s ', n);
  select count(*) into n from ride_requests where order_id = o; res := res || format('rides=%s | ', n);
  select count(*) into n from delivery_estimates where order_id = o and id = (est->>'estimate_id')::uuid; res := res || format('estimativa consumida=%s | ', n);

  -- reuso da mesma estimativa
  perform pg_temp.as_user(cust); set local role authenticated;
  begin perform create_store_order(st, items, 'entrega', 'pix', addr, lat, lng, null, null, null, null, (est->>'estimate_id')::uuid); res := res||'reuso aceito(BAD) | ';
  exception when others then get stacked diagnostics hint = pg_exception_hint; res := res || format('reuso recusado(%s) | ', hint); end;
  reset role;

  -- T6 estimativa de outro cliente
  est2 := record_delivery_estimate(other, st, lat, lng, 5017, 'route', 'verified', addr);
  perform pg_temp.as_user(cust); set local role authenticated;
  begin perform create_store_order(st, items, 'entrega', 'pix', addr, lat, lng, null, null, null, null, (est2->>'estimate_id')::uuid); res := res||'T6 outro cliente aceito(BAD) | ';
  exception when others then get stacked diagnostics hint = pg_exception_hint; res := res || format('T6 outro cliente recusado(%s) | ', hint); end;
  reset role;

  -- T7 estimativa de outra loja (linha inserida direto, do mesmo cliente)
  insert into delivery_estimates(customer_id, store_id, destination_lat, destination_lng, destination_address, estimated_freight, distance_km, calculation_version, snapshot, expires_at)
    values (cust, st2, lat, lng, lower(addr), 5, 3, 'est-v1', '{"destination_check":"verified"}', now() + interval '10 minutes') returning to_jsonb(delivery_estimates) into est2;
  perform pg_temp.as_user(cust); set local role authenticated;
  begin perform create_store_order(st, items, 'entrega', 'pix', addr, lat, lng, null, null, null, null, (est2->>'id')::uuid); res := res||'T7 outra loja aceita(BAD) | ';
  exception when others then get stacked diagnostics hint = pg_exception_hint; res := res || format('T7 outra loja recusada(%s) | ', hint); end;
  reset role;

  -- T8 expirada
  insert into delivery_estimates(customer_id, store_id, destination_lat, destination_lng, destination_address, estimated_freight, distance_km, calculation_version, snapshot, expires_at)
    values (cust, st, lat, lng, lower(addr), 8.03, 5.017, 'est-v1', '{"destination_check":"verified"}', now() - interval '1 minute') returning to_jsonb(delivery_estimates) into est2;
  perform pg_temp.as_user(cust); set local role authenticated;
  begin perform create_store_order(st, items, 'entrega', 'pix', addr, lat, lng, null, null, null, null, (est2->>'id')::uuid); res := res||'T8 expirada aceita(BAD) | ';
  exception when others then get stacked diagnostics hint = pg_exception_hint; res := res || format('T8 expirada recusada(%s) | ', hint); end;
  reset role;

  -- T9 endereco alterado depois da estimativa (texto e coordenadas)
  est2 := record_delivery_estimate(cust, st, lat, lng, 5017, 'route', 'verified', addr);
  perform pg_temp.as_user(cust); set local role authenticated;
  begin perform create_store_order(st, items, 'entrega', 'pix', 'Avenida Sete de Setembro, 100, Porto Velho', lat, lng, null, null, null, null, (est2->>'estimate_id')::uuid); res := res||'T9a texto novo aceito(BAD) | ';
  exception when others then get stacked diagnostics hint = pg_exception_hint; res := res || format('T9a endereco novo recusado(%s) | ', hint); end;
  begin perform create_store_order(st, items, 'entrega', 'pix', addr, -8.7700, -63.9100, null, null, null, null, (est2->>'estimate_id')::uuid); res := res||'T9b coords novas aceitas(BAD) | ';
  exception when others then get stacked diagnostics hint = pg_exception_hint; res := res || format('T9b coordenadas novas recusadas(%s) | ', hint); end;
  reset role;
  -- nova estimativa invalida a anterior nao usada
  est := record_delivery_estimate(cust, st, lat, lng, 5017, 'route', 'verified', addr);
  perform pg_temp.as_user(cust); set local role authenticated;
  begin perform create_store_order(st, items, 'entrega', 'pix', addr, lat, lng, null, null, null, null, (est2->>'estimate_id')::uuid); res := res||'estimativa substituida aceita(BAD) | ';
  exception when others then get stacked diagnostics hint = pg_exception_hint; res := res || format('estimativa substituida recusada(%s) | ', hint); end;
  reset role;
  -- estimativa 'unverified'
  est2 := record_delivery_estimate(cust, st, lat, lng, 5017, 'route', 'unverified', addr);
  perform pg_temp.as_user(cust); set local role authenticated;
  begin perform create_store_order(st, items, 'entrega', 'pix', addr, lat, lng, null, null, null, null, (est2->>'estimate_id')::uuid); res := res||'unverified aceita(BAD) | ';
  exception when others then get stacked diagnostics hint = pg_exception_hint; res := res || format('unverified recusada(%s) | ', hint); end;
  reset role;

  -- T10 tarifa alterada durante a validade nao muda a estimativa apresentada
  est := record_delivery_estimate(cust, st, lat, lng, 5017, 'route', 'verified', addr);
  update platform_tariffs set base_fee = 9 where vehicle_kind = 'moto';
  perform pg_temp.as_user(cust); set local role authenticated;
  j := create_store_order(st, items, 'entrega', 'pix', addr, lat, lng, null, null, null, null, (est->>'estimate_id')::uuid);
  reset role; o2 := (j->>'order_id')::uuid;
  res := res || format('T10 tarifa nova(base 9) mas pedido manteve frete=%s (estimativa %s) | ', j->>'delivery_fee', est->>'estimated_freight');
  est2 := record_delivery_estimate(cust, st, lat, lng, 5017, 'route', 'verified', addr);
  res := res || format('(estimativa nova ja usa a tarifa nova=%s) | ', est2->>'estimated_freight');
  update platform_tariffs set base_fee = 5 where vehicle_kind = 'moto';

  -- T11/T12 adulteracao de frete e total depois de criado: cliente nao altera; loja so muda status
  perform pg_temp.as_user(cust); set local role authenticated;
  update orders set delivery_fee = 1, total_amount = 1 where id = o; get diagnostics n = row_count; res := res || format('T11/12 cliente atualizar pedido afetou %s linhas | ', n);
  begin insert into orders(store_id, buyer_id, delivery_fee, total_amount, delivery_flow_version, status) values (st, cust, 1, 1, 2, 'pending'); res := res||'T13 insert direto V2 aceito(BAD) | ';
  exception when insufficient_privilege or others then res := res || format('T13 insert direto com flow_version=2 negado(%s) | ', sqlstate); end;
  reset role;
  perform pg_temp.as_user(owner); set local role authenticated;
  begin update orders set delivery_fee = 1 where id = o; res := res||'loja alterou frete(BAD) | ';
  exception when others then res := res || 'T11 loja nao altera frete | '; end;
  begin update orders set total_amount = 1 where id = o; res := res||'loja alterou total(BAD) | ';
  exception when others then res := res || 'T12 loja nao altera total | '; end;
  begin update orders set delivery_flow_version = 1 where id = o; res := res||'loja mudou versao(BAD) | ';
  exception when others then res := res || 'T13 loja nao muda versao | '; end;
  begin update store_delivery_flow set v2_enabled = false where store_id = st; get diagnostics n = row_count; res := res||format('T24 loja mexeu na chave (linhas=%s) | ', n);
  exception when others then res := res || 'T24 loja nao altera a chave | '; end;
  reset role;

  -- V1 quando a chave da loja esta desligada: estimativa e ignorada e o frete segue o V1
  update store_delivery_flow set v2_enabled = false where store_id = st;
  perform pg_temp.as_user(cust); set local role authenticated;
  j := create_store_order(st, items, 'entrega', 'pix', addr, lat, lng, null, null, null, null, (est->>'estimate_id')::uuid);
  reset role;
  res := res || format('T13b chave da loja off: flow=%s frete(V1)=%s | ', j->>'flow_version', j->>'delivery_fee');
  update store_delivery_flow set v2_enabled = true where store_id = st;

  -- T15 recusa pela loja: nada de entrega
  perform pg_temp.as_user(owner); set local role authenticated; update orders set status = 'rejected' where id = o2; reset role;
  select count(*) into n from order_delivery_dispatches where order_id = o2; res := res || format('T15 recusado: dispatch=%s ', n);
  select count(*) into n from ride_requests where order_id = o2; res := res || format('rides=%s ', n);
  select count(*) into n from delivery_obligations ob join order_delivery_dispatches dd on dd.id = ob.dispatch_id where dd.order_id = o2; res := res || format('obrigacoes=%s | ', n);
  select count(*) into n from delivery_estimates where order_id = o2; res := res || format('(estimativa segue vinculada ao pedido recusado=%s) | ', n);

  -- T16..T20 aceite da loja
  perform pg_temp.as_user(owner); set local role authenticated; update orders set status = 'preparing' where id = o; reset role;
  select * into rec from order_delivery_dispatches where order_id = o;
  d := rec.id;
  res := res || format('T16 dispatch flow=%s fase=%s status=%s ride=%s | ', rec.flow_version, rec.phase, rec.status, rec.ride_request_id is not null);
  res := res || format('T17 estimate_id correto=%s | ', rec.estimate_id = (est->>'estimate_id')::uuid or rec.estimate_id = (select id from delivery_estimates where order_id = o));
  res := res || format('T18 estimada=%s original=%s oferta=%s | ', rec.estimated_freight, rec.original_freight, rec.final_freight);
  update order_delivery_dispatches set final_freight = 9 where id = d; update order_delivery_dispatches set final_freight = 10 where id = d;
  begin update order_delivery_dispatches set estimated_freight = 10 where id = d; res := res||'estimada mudou(BAD) | ';
  exception when insufficient_privilege then null; end;
  select estimated_freight, final_freight, frozen_freight into rec from order_delivery_dispatches where id = d;
  res := res || format('T19 apos ofertas simuladas: estimada=%s oferta=%s congelado=%s | ', rec.estimated_freight, rec.final_freight, coalesce(rec.frozen_freight::text, 'null'));
  select e.data into rec from order_delivery_events e where e.dispatch_id = d and e.kind = 'estimate_recorded';
  res := res || format('T20 evento: order_id=%s estimate_id=%s frete=%s versao_calc=%s snapshot_final=%s | ', rec.data->>'order_id' is not null, rec.data->>'estimate_id' is not null, rec.data->>'estimated_freight', rec.data->>'calculation_version', rec.data->'estimate_snapshot'->>'final_cents');
  select count(*) into n from order_delivery_events e where e.dispatch_id = d and e.kind = 'phase_change' and e.phase_to = 'PROCURANDO_ENTREGADOR'; res := res || format('(inicio da busca registrado=%s) | ', n);
  select (e.data::text ilike '%Dom Pedro%' or e.data::text ilike '%-63.9%') into bl from order_delivery_events e where e.dispatch_id = d and e.kind = 'estimate_recorded';
  res := res || format('(evento com endereco/coordenada=%s) | ', bl);
  -- navegacao pedido -> entrega -> estimativa -> snapshot
  select (select count(*) from orders oo join order_delivery_dispatches dd on dd.order_id = oo.id join delivery_estimates ee on ee.id = dd.estimate_id and ee.order_id = oo.id where oo.id = o and ee.snapshot ? 'final_cents') into n;
  res := res || format('(navegacao pedido>entrega>estimativa>snapshot=%s) | ', n);

  -- T21 limpeza de orfas nao apaga estimativa vinculada
  insert into delivery_estimates(customer_id, store_id, destination_lat, destination_lng, destination_address, estimated_freight, distance_km, calculation_version, snapshot, expires_at, created_at)
    values (cust, st, lat, lng, lower(addr), 5, 3, 'est-v1', '{}', now() - interval '20 days', now() - interval '20 days');
  update delivery_estimates set created_at = created_at where false;
  delete from delivery_estimates where order_id is null and created_at < now() - interval '7 days';
  select count(*) into n from delivery_estimates where order_id = o; res := res || format('T21 vinculada sobrevive=%s ', n);
  select count(*) into n from delivery_estimates where created_at < now() - interval '7 days' and order_id is null; res := res || format('orfas antigas restantes=%s | ', n);

  -- T22 cancelamento antes do aceite (cliente apaga pedido pendente): sem corrida/obrigacao/pagamento; estimativa liberada
  est := record_delivery_estimate(cust, st, lat, lng, 5017, 'route', 'verified', addr);
  perform pg_temp.as_user(cust); set local role authenticated;
  j := create_store_order(st, items, 'entrega', 'pix', addr, lat, lng, null, null, null, null, (est->>'estimate_id')::uuid);
  delete from orders where id = (j->>'order_id')::uuid; get diagnostics n = row_count;
  reset role;
  res := res || format('T22 cancelamento apagou=%s ', n);
  select count(*) into n from ride_requests where order_id = (j->>'order_id')::uuid; res := res || format('rides=%s ', n);
  select count(*) into n from order_delivery_dispatches where order_id = (j->>'order_id')::uuid; res := res || format('dispatch=%s ', n);
  select count(*) into n from delivery_payment_events pe join order_delivery_dispatches dd on dd.id = pe.dispatch_id where dd.order_id = (j->>'order_id')::uuid; res := res || format('pagamentos=%s | ', n);
  select order_id is null into bl from delivery_estimates where id = (est->>'estimate_id')::uuid; res := res || format('(estimativa liberada=%s) | ', bl);

  -- T23 outro usuario (lucy) nao ve pedido/estimativa/entrega do cliente
  perform pg_temp.as_user(other); set local role authenticated;
  select count(*) into c1 from orders where id = o; select count(*) into c2 from delivery_estimates where customer_id = cust; select count(*) into c3 from order_delivery_dispatches where id = d;
  res := res || format('T23 outro usuario ve pedido=%s estimativas=%s entrega=%s | ', c1, c2, c3);
  reset role;
  raise exception 'RESULT: %', res;
end $$;
