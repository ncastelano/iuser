-- Etapa 2.3: cenários da estimativa oficial do frete (fórmula est-v1, adulteração, chave V2, imutabilidade da estimada).
-- Roda tudo e DESFAZ no fim (RAISE EXCEPTION 'RESULT: …' mostra o resultado de cada teste). Usa a loja iUser e o perfil lucy de teste.
-- Rodar: env -u SUPABASE_ACCESS_TOKEN npx supabase db query --linked -f supabase/tests/delivery_estimate_scenarios.sql
create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$
begin perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true); end $f$;
do $$
declare st uuid := '93e432b4-0472-4ae4-abb1-45b516e2f7bd'; cust uuid; owner uuid; res text := ''; j jsonb; j2 jsonb; n int; x text; k int;
  rec record; cents int[]; o uuid; ride uuid; d uuid; e1 numeric;
begin
  select id into cust from profiles where id not in (select owner_id from stores) and "profileSlug" in ('lucy') limit 1;
  select owner_id into owner from stores where id=st;
  -- T1 estimativa valida (5310 m)
  j := record_delivery_estimate(cust, st, -8.7500, -63.9000, 5310, 'route', 'verified');
  res := res || format('T1 frete=%s km=%s versao=%s | ', j->>'estimated_freight', j->>'distance_km', j->>'calculation_version');
  -- T2 determinismo
  j2 := record_delivery_estimate(cust, st, -8.7500, -63.9000, 5310, 'route', 'verified');
  res := res || format('T2 iguais=%s | ', j->>'estimated_freight' = j2->>'estimated_freight');
  -- T3/T4/T5 adulteracao: a assinatura nao aceita frete/distancia/tarifa do app e o app nem executa a funcao
  perform pg_temp.as_user(cust); set local role authenticated;
  begin perform record_delivery_estimate(cust, st, -8.75, -63.9, 1, 'route', 'verified'); res := res||'T3/T4 RPC executada pelo app(BAD) | ';
  exception when insufficient_privilege then res := res||'T3/T4 app nao executa a RPC(ok) | '; end;
  begin insert into delivery_estimates(customer_id,store_id,destination_lat,destination_lng,estimated_freight,distance_km,calculation_version,snapshot,expires_at) values (cust,st,-8.75,-63.9,0.01,0.1,'x','{}',now()); res := res||'insert direto(BAD) | ';
  exception when insufficient_privilege then res := res||'T3 insert direto negado | '; end;
  begin update delivery_estimates set estimated_freight=1 where customer_id=cust; get diagnostics n=row_count; res := res||format('update direto negado/%s | ', n);
  exception when insufficient_privilege then res := res||'update direto negado | '; end;
  begin update platform_tariffs set base_fee=0, price_per_km=0; get diagnostics n=row_count; res := res||format('T5 tarifa: update afetou %s linhas | ', n); exception when insufficient_privilege then res := res||'T5 tarifa nao editavel | '; end;
  begin perform 1 from platform_tariffs limit 1; get diagnostics n=row_count; res := res||format('(tarifa legivel=%s) | ',n); exception when insufficient_privilege then res := res||'(tarifa sem leitura) | '; end;
  begin perform 1 from delivery_dispatch_settings; res := res||'settings legivel(BAD) | '; exception when insufficient_privilege then res := res||'T10 settings negado | '; end;
  begin update delivery_dispatch_settings set min_freight=0; get diagnostics n=row_count; res := res||format('settings update afetou %s | ', n); exception when insufficient_privilege then res := res||'T10 settings nao editavel | '; end;
  begin update delivery_dispatch_settings set new_delivery_flow_enabled=true; get diagnostics n=row_count; res := res||format('T11 V2 global update afetou %s | ', n); exception when others then res := res||'T11 V2 global negado | '; end;
  begin update store_delivery_flow set v2_enabled=true; get diagnostics n=row_count; res := res||format('T11 V2 loja update afetou %s | ', n); exception when others then res := res||'T11 V2 loja negado | '; end;
  begin perform 1 from store_delivery_flow; res := res||'chave da loja legivel(BAD) | '; exception when insufficient_privilege then res := res||'chave da loja sem leitura | '; end;
  select count(*) into n from delivery_estimates; res := res||format('(cliente le %s estimativas proprias) | ', n);
  reset role;
  -- dono da loja tambem nao toca
  perform pg_temp.as_user(owner); set local role authenticated;
  begin update store_delivery_flow set v2_enabled=true; get diagnostics n=row_count; res := res||format('dono update V2 afetou %s | ', n); exception when others then res := res||'dono nao liga V2 da loja | '; end;
  reset role;
  -- T6 minimo
  update delivery_dispatch_settings set min_freight = 10;
  j := record_delivery_estimate(cust, st, -8.7500, -63.9000, 5310, 'route', 'verified');
  select snapshot into rec from delivery_estimates where id=(j->>'estimate_id')::uuid;
  res := res || format('T6 min=10 -> frete=%s min_applied=%s | ', j->>'estimated_freight', rec.snapshot->>'min_applied');
  update delivery_dispatch_settings set min_freight = 0;
  -- T7 teto
  update delivery_dispatch_settings set max_freight = 8;
  j := record_delivery_estimate(cust, st, -8.7500, -63.9000, 5310, 'route', 'verified');
  select snapshot into rec from delivery_estimates where id=(j->>'estimate_id')::uuid;
  res := res || format('T7 teto=8 -> frete=%s ceiling_applied=%s | ', j->>'estimated_freight', rec.snapshot->>'ceiling_applied');
  update delivery_dispatch_settings set max_freight = 60;
  -- T8 arredondamento nas bordas (passo 0,50) NEAREST e UP
  res := res || 'T8 NEAREST: ';
  foreach k in array array[1224,1225,1226,1249,1250,1251] loop res := res || format('%s->%s ', k, _freight_round_cents(k,50,'NEAREST')); end loop;
  res := res || '| UP: ';
  foreach k in array array[1224,1225,1226,1249,1250,1251] loop res := res || format('%s->%s ', k, _freight_round_cents(k,50,'UP')); end loop;
  res := res || '| ';
  -- arredondamento passa pelo fluxo completo: step 0,50 NEAREST com 5310 m (847) -> 850
  update delivery_dispatch_settings set freight_rounding_step = 0.50;
  j := record_delivery_estimate(cust, st, -8.7500, -63.9000, 5310, 'route', 'verified');
  res := res || format('(fluxo: 847c passo 0,50 -> %s) | ', j->>'estimated_freight');
  update delivery_dispatch_settings set freight_rounding_step = 0.01;
  -- limites: fora da area, rota inconsistente
  begin perform record_delivery_estimate(cust, st, -9.9, -63.9, 5310, 'route', 'verified'); res := res||'fora da area aceito(BAD) | ';
  exception when others then res := res||'fora da area recusado | '; end;
  begin perform record_delivery_estimate(cust, st, -8.7500, -63.9000, 100, 'route', 'verified'); res := res||'rota curta aceita(BAD) | ';
  exception when others then res := res||'rota inconsistente recusada | '; end;
  -- T12/T13
  select new_delivery_flow_enabled into x from delivery_dispatch_settings; res := res||format('T12 global V2=%s | ', x);
  select count(*) into n from store_delivery_flow where v2_enabled; res := res||format('T13 lojas com V2=%s de %s (lojas=%s) | ', n, (select count(*) from store_delivery_flow), (select count(*) from stores));
  -- T14 entrega nao nasce V2
  perform pg_temp.as_user(cust); set local role authenticated;
  j := create_store_order(st, '[{"product_id":"bdf2d5b5-3879-4c8f-bd9a-6a6241b24570","quantity":1}]'::jsonb,'entrega','pix','Rua X, 1, Porto Velho',-8.7860,-63.8760,null,null,null,null);
  reset role; o := (j->>'order_id')::uuid;
  perform pg_temp.as_user(owner); set local role authenticated; update orders set status='preparing' where id=o; reset role;
  select id into d from order_delivery_dispatches where order_id=o;
  select flow_version into n from order_delivery_dispatches where id=d; res := res||format('T14 flow_version da entrega real=%s | ', n);
  begin insert into order_delivery_dispatches(order_id, store_id, ride_request_id, status, flow_version) select order_id, store_id, ride_request_id, 'searching', 2 from order_delivery_dispatches where id=d; res := res||'insert V2(BAD) | ';
  exception when others then res := res||format('T14 criar V2 negado (%s) | ', sqlstate); end;
  -- T19 estimada separada de oferecida/congelada
  select estimated_freight into e1 from order_delivery_dispatches where id=d; res := res||format('(estimada inicial ja gravada=%s) | ', coalesce(e1::text,'null'));
  update order_delivery_dispatches set estimate_id = (j2->>'estimate_id')::uuid where id=d;
  update order_delivery_dispatches set final_freight = 13 where id=d; update order_delivery_dispatches set final_freight = 14 where id=d;
  select estimated_freight, final_freight, frozen_freight into rec from order_delivery_dispatches where id=d;
  res := res || format('T19 estimada=%s oferta=%s congelado=%s | ', rec.estimated_freight, rec.final_freight, coalesce(rec.frozen_freight::text,'null'));
  begin update order_delivery_dispatches set estimated_freight = 99 where id=d; res := res||'estimada mudou(BAD) | ';
  exception when insufficient_privilege then res := res||'estimada imutavel | '; end;
  begin update order_delivery_dispatches set estimate_id = null where id=d; res := res||'vinculo mudou(BAD) | ';
  exception when insufficient_privilege then res := res||'vinculo imutavel | '; end;
  res := res || format('(evento estimate_recorded existe=%s; funcao de auditoria leva snapshot=%s) | ', exists(select 1 from order_delivery_events where dispatch_id=d and kind='estimate_recorded'), position('estimate_snapshot' in pg_get_functiondef('public.audit_dispatch_changes()'::regprocedure))>0);
  -- T18 snapshot sem PII
  select snapshot into rec from delivery_estimates where id=(j2->>'estimate_id')::uuid;
  res := res || format('T18 chaves=%s | ', (select string_agg(key, ',' order by key) from jsonb_object_keys(rec.snapshot) key));
  raise exception 'RESULT: %', res;
end $$;
