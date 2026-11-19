-- Cenários da 20261130000082 (aceites registrados e "Quem vende"). Transação desfeita; só LOCAL/staging.
begin;
do $$
declare v_drv uuid; v_store uuid; v_owner uuid; v_other uuid; j jsonb; v_hint text;
begin
  select driver_id into v_drv from driver_pricing limit 1;
  select id, owner_id into v_store, v_owner from stores where owner_id <> v_drv limit 1;
  select id into v_other from profiles where id not in (v_drv, v_owner) limit 1;
  delete from legal_acceptances where user_id in (v_drv, v_owner);

  -- 1. modo motorista: sem declaração o app não liga
  update driver_pricing set driver_mode_active = false where driver_id = v_drv;
  perform set_config('request.jwt.claims', json_build_object('sub', v_drv, 'role', 'authenticated')::text, true);
  begin update driver_pricing set driver_mode_active = true where driver_id = v_drv; raise exception 'FALHA 1: ligou sem declaração';
  exception when others then get stacked diagnostics v_hint = pg_exception_hint; if v_hint is distinct from 'driver_declaration_required' then raise; end if; end;
  perform public.accept_legal('driver_requirements');
  update driver_pricing set driver_mode_active = true where driver_id = v_drv;
  j := public.get_my_legal();
  if not (j->'driver_requirements'->>'accepted')::boolean or (j->'terms'->>'accepted')::boolean then raise exception 'FALHA 1b: get_my_legal %', j; end if;
  raise notice 'ok 1: modo motorista exige a declaração';

  -- 2. versão nova dos termos = aceitar de novo
  perform public.accept_legal('terms');
  if not (public.get_my_legal()->'terms'->>'accepted')::boolean then raise exception 'FALHA 2'; end if;
  update legal_documents set version = '2099-01-01' where doc = 'terms';
  if (public.get_my_legal()->'terms'->>'accepted')::boolean then raise exception 'FALHA 2b: versão nova já aceita'; end if;
  raise notice 'ok 2: aceite guardado por versão';

  -- 3. declaração da loja: só o dono
  begin perform public.accept_legal('store_regulated', v_store); raise exception 'FALHA 3: outro declarou pela loja';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.accept_legal('store_regulated', v_store);
  if not (public.get_my_legal(v_store)->'store_regulated'->>'accepted')::boolean then raise exception 'FALHA 3b'; end if;
  raise notice 'ok 3: declaração da loja só pelo dono';

  -- 4. quem vende: número conferido, CPF mascarado em público, número inteiro só para o dono
  begin perform public.set_store_seller(v_store, 'Maria Souza', 'cpf', '529.982.247-24', 'Rua A, 10, Centro, Porto Velho/RO'); raise exception 'FALHA 4: aceitou CPF errado';
  exception when others then get stacked diagnostics v_hint = pg_exception_hint; if v_hint is distinct from 'seller_doc' then raise; end if; end;
  perform public.set_store_seller(v_store, 'Maria Souza', 'cpf', '529.982.247-25', 'Rua A, 10, Centro, Porto Velho/RO');
  if (select seller_doc_public from stores where id = v_store) <> '***.982.247-**' then raise exception 'FALHA 4b: %', (select seller_doc_public from stores where id = v_store); end if;
  if public.get_store_seller(v_store)->>'doc' <> '52998224725' then raise exception 'FALHA 4c'; end if;
  perform public.set_store_seller(v_store, 'Pizzaria LTDA', 'cnpj', '11.222.333/0001-81', 'Rua A, 10, Centro, Porto Velho/RO');
  if (select seller_doc_public from stores where id = v_store) <> '11.222.333/0001-81' then raise exception 'FALHA 4d'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  if public.get_store_seller(v_store) is not null then raise exception 'FALHA 4e: estranho leu o documento'; end if;
  begin perform public.set_store_seller(v_store, 'X Y', 'cnpj', '11222333000181', 'Rua B, 1'); raise exception 'FALHA 4f: estranho gravou';
  exception when others then if sqlerrm like 'FALHA%' then raise; end if; end;
  if has_column_privilege('anon', 'public.stores', 'seller_doc', 'select') or not has_column_privilege('anon', 'public.stores', 'seller_doc_public', 'select')
     or has_column_privilege('authenticated', 'public.stores', 'seller_name', 'update') or has_table_privilege('authenticated', 'public.legal_acceptances', 'select')
  then raise exception 'FALHA 4g: permissões'; end if;
  raise notice 'ok 4: quem vende conferido e com o documento protegido';
end $$;
rollback;
