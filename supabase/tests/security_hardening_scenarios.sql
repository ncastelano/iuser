-- Cenários da 20261130000079_security_hardening.sql (transação desfeita; só LOCAL/staging).
-- O acesso do anon é conferido pelo CATÁLOGO (SET ROLE anon em função sem permissão derruba o Postgres local).
begin;
do $$
declare v_prod uuid; v_req uuid; v_a uuid; v_b uuid; v_c0 int; v_c1 int; v_ok boolean; i int;
begin
  -- 1/2: funções internas fora do app
  if has_function_privilege('anon', 'public._grant_hierarchy_borders(uuid)', 'execute') or has_function_privilege('authenticated', 'public._grant_prepaid_borders(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public._wait_auto_end(uuid,text,text)', 'execute') or has_function_privilege('anon', 'public._community_close_rounds(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.consume_campaign_code(text,uuid,text)', 'execute') or has_function_privilege('anon', 'public.record_store_visit(uuid,text,uuid,text,text,text,text)', 'execute')
  then raise exception 'FALHA 1: função interna ainda executável pelo app'; end if;
  if not has_function_privilege('anon', 'public.increment_product_view_count(uuid)', 'execute') or not has_function_privilege('anon', 'public.record_profile_visit(uuid,text,uuid,text,text,text,text)', 'execute')
  then raise exception 'FALHA 1b: contador público perdeu o acesso'; end if;
  if has_table_privilege('anon', 'public.counter_hits', 'select') or has_table_privilege('authenticated', 'public.counter_anon_buckets', 'insert')
  then raise exception 'FALHA 1c: tabelas de controle legíveis'; end if;
  raise notice 'ok 1: funções internas e tabelas fechadas';

  select id into v_prod from products limit 1;
  select id into v_a from profiles order by created_at limit 1;
  select id into v_b from profiles where id <> v_a order by created_at limit 1;

  -- 3: logado conta 1 vez por dia
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  select view_count into v_c0 from products where id = v_prod;
  for i in 1..5 loop perform public.increment_product_view_count(v_prod); end loop;
  select view_count into v_c1 from products where id = v_prod;
  if v_c1 - coalesce(v_c0,0) <> 1 then raise exception 'FALHA 3: logado contou % vezes', v_c1 - coalesce(v_c0,0); end if;
  select share_count into v_c0 from products where id = v_prod;
  for i in 1..5 loop perform public.increment_product_share_count(v_prod); end loop;
  select share_count into v_c1 from products where id = v_prod;
  if v_c1 - coalesce(v_c0,0) <> 1 then raise exception 'FALHA 3b: compartilhamento contou % vezes', v_c1 - coalesce(v_c0,0); end if;
  raise notice 'ok 3: logado conta 1 vez por dia';

  -- 3c: anônimo — teto por hora; compartilhamento não conta
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select view_count into v_c0 from products where id = v_prod;
  for i in 1..100 loop perform public.increment_product_view_count(v_prod); end loop;
  select view_count into v_c1 from products where id = v_prod;
  if v_c1 - v_c0 <> public.counter_anon_cap() then raise exception 'FALHA 3c: anônimo contou %', v_c1 - v_c0; end if;
  select share_count into v_c0 from products where id = v_prod;
  perform public.increment_product_share_count(v_prod);
  select share_count into v_c1 from products where id = v_prod;
  if v_c1 <> v_c0 then raise exception 'FALHA 3d: compartilhamento anônimo contou'; end if;
  raise notice 'ok 3c: anônimo limitado a % por hora', public.counter_anon_cap();

  -- 4: visita ao perfil — o viewer é o login, não o que o app manda
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  delete from profile_visits where profile_id = v_b and created_at > now() - interval '1 hour';
  v_ok := public.record_profile_visit(v_b, 's1', p_viewer_id => v_b);
  if not v_ok then raise exception 'FALHA 4: visita não contou'; end if;
  if not exists (select 1 from profile_visits where profile_id = v_b and viewer_id = v_a and created_at > now() - interval '1 minute')
  then raise exception 'FALHA 4b: viewer não é o login'; end if;
  if public.record_profile_visit(v_b, 's2') then raise exception 'FALHA 4c: repetida em 10 min contou'; end if;
  if public.record_profile_visit(v_a, 's3') then raise exception 'FALHA 4d: a própria pessoa contou'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  for i in 1..60 loop perform public.record_profile_visit(v_b, 's', p_anonymous_id => 'x' || i, p_viewer_id => v_a); end loop;
  if (select count(*) from profile_visits where profile_id = v_b and viewer_id is null and created_at > now() - interval '1 minute') <> public.counter_anon_cap()
  then raise exception 'FALHA 4e: anônimos sem teto'; end if;
  if exists (select 1 from profile_visits where profile_id = v_b and viewer_id = v_a and anonymous_id is not null)
  then raise exception 'FALHA 4f: anônimo se passou por outra pessoa'; end if;
  raise notice 'ok 4: visitas sem falsificação e com teto';

  -- 5: telemetria
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  select coalesce(sum(count),0) into v_c0 from service_usage_telemetry_daily where day = current_date;
  perform public.track_service_usage('firebase', 'fcm_sends', 999999);
  perform public.track_service_usage('mapbox', 'directions', 999999);
  select coalesce(sum(count),0) into v_c1 from service_usage_telemetry_daily where day = current_date;
  if v_c1 - v_c0 <> 1 then raise exception 'FALHA 5: telemetria sem limite (%)', v_c1 - v_c0; end if;
  raise notice 'ok 5: telemetria limitada';

  -- 6 (migration 080): pedido RETIDO (esperando entregador) não mostra a chave Pix nem aceita "Já paguei"
  declare v_o uuid; v_buyer uuid; v_j jsonb; v_hint text;
  begin
    select o.id, o.buyer_id into v_o, v_buyer from orders o join order_payments p on p.order_id = o.id
      where p.method = 'pix' and o.buyer_id is not null and o.status = 'pending' limit 1;
    if v_o is null then raise notice 'pulado 6: sem pedido Pix pendente na massa local'; else
      update orders set store_visible = false where id = v_o;
      update order_payments set status = 'awaiting' where order_id = v_o;
      perform set_config('request.jwt.claims', json_build_object('sub', v_buyer, 'role', 'authenticated')::text, true);
      v_j := public.get_order_payment(v_o);
      if not (v_j->>'held')::boolean or v_j->>'pix_key' is not null then raise exception 'FALHA 6: retido mostrou a chave (%)', v_j; end if;
      begin perform public.report_order_paid(v_o); raise exception 'FALHA 6b: retido aceitou o pagamento';
      exception when others then get stacked diagnostics v_hint = pg_exception_hint; if v_hint is distinct from 'order_held' then raise; end if; end;
      update orders set store_visible = true where id = v_o;
      v_j := public.get_order_payment(v_o);
      if (v_j->>'held')::boolean then raise exception 'FALHA 6c: liberado continuou retido'; end if;
      raise notice 'ok 6: pedido retido só paga depois que a loja recebe';
    end if;
  end;
end $$;
rollback;
