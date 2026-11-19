-- Cenários da 20261130000081 (denunciar loja, perfil e produto). Transação desfeita; só LOCAL/staging.
begin;
do $$
declare v_store uuid; v_owner uuid; v_prod uuid; v_powner uuid; r uuid[]; i int; v text; v_hint text;
begin
  select s.id, s.owner_id into v_store, v_owner from stores s where s.is_active limit 1;
  select p.id, coalesce(s.owner_id, p.owner_id) into v_prod, v_powner from products p left join stores s on s.id = p.store_id
   where p.is_active and coalesce(p.listing_type,'') <> 'publication' and coalesce(p.type,'') <> 'digital' and coalesce(s.owner_id, p.owner_id) is not null limit 1;
  select array_agg(id) into r from (select id from profiles where id not in (v_owner, v_powner) and created_at < now() - interval '2 days' order by created_at limit 4) x;
  delete from content_reports where target_id in (v_store, v_prod, v_owner);
  delete from content_moderation where target_id in (v_store, v_prod, v_owner);

  -- loja: 4 denúncias e continua no ar (só o admin oculta)
  for i in 1..4 loop
    perform set_config('request.jwt.claims', json_build_object('sub', r[i], 'role', 'authenticated')::text, true);
    v := public.report_content('store', v_store, 'scam', 'loja falsa');
  end loop;
  if v <> 'reported' or not (select is_active from stores where id = v_store) then raise exception 'FALHA 1: loja ocultada sozinha'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', r[1], 'role', 'authenticated')::text, true);
  perform public.report_content('profile', v_owner, 'scam');
  if (select is_blocked from profiles where id = v_owner) then raise exception 'FALHA 1b: perfil bloqueado sozinho'; end if;
  raise notice 'ok 1: loja e perfil só pelo admin';

  -- dono não denuncia a própria loja
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  begin perform public.report_content('store', v_store, 'spam'); raise exception 'FALHA 2: dono denunciou a própria loja'; exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  raise notice 'ok 2: dono não denuncia o que é seu';

  -- produto: 3 pessoas ocultam
  for i in 1..3 loop
    perform set_config('request.jwt.claims', json_build_object('sub', r[i], 'role', 'authenticated')::text, true);
    v := public.report_content('product', v_prod, 'illegal');
  end loop;
  if v <> 'hidden' or (select is_active from products where id = v_prod) then raise exception 'FALHA 3: produto não ocultou (%)', v; end if;
  raise notice 'ok 3: produto ocultado com 3 denúncias';

  -- o dono não reativa
  perform set_config('request.jwt.claims', json_build_object('sub', v_powner, 'role', 'authenticated')::text, true);
  begin update products set is_active = true where id = v_prod; raise exception 'FALHA 4: dono reativou';
  exception when others then get stacked diagnostics v_hint = pg_exception_hint; if v_hint is distinct from 'moderation_hidden' then raise; end if; end;
  raise notice 'ok 4: dono não reativa o que o iUser ocultou';

  -- admin: oculta a loja e o perfil; restaurar devolve
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  perform public.admin_moderate('store', v_store, 'hide', 'golpe confirmado', null);
  perform public.admin_moderate('profile', v_owner, 'hide', 'golpe confirmado', null);
  if (select is_active from stores where id = v_store) or not (select is_blocked from profiles where id = v_owner) then raise exception 'FALHA 5: admin não ocultou'; end if;
  perform public.admin_moderate('store', v_store, 'restore', null, null);
  perform public.admin_moderate('profile', v_owner, 'restore', null, null);
  perform public.admin_moderate('product', v_prod, 'restore', null, null);
  if not (select is_active from stores where id = v_store) or (select is_blocked from profiles where id = v_owner) or not (select is_active from products where id = v_prod) then raise exception 'FALHA 5b: restaurar não devolveu'; end if;
  raise notice 'ok 5: admin oculta e restaura loja, perfil e produto';
end $$;
rollback;
