-- Cenários da 20261130000060 (modelos de criador, destaque, prévia de livro). Só LOCAL/staging, transação desfeita.
-- docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/creator_store_models_scenarios.sql
begin;
do $$
declare v_store uuid; v_owner uuid; v_other uuid; p1 uuid; p2 uuid; v_ok boolean;
begin
    select s.id, s.owner_id into v_store, v_owner from public.stores s where exists (select 1 from public.products p where p.store_id = s.id and p.type = 'digital') limit 1;
    select id into v_other from public.profiles where id <> v_owner limit 1;
    select id into p1 from public.products where store_id = v_store order by created_at limit 1;
    select id into p2 from public.products where store_id = v_store and id <> p1 order by created_at limit 1;

    -- 1) os modelos novos são aceitos; um inventado não
    update public.stores set store_model = 'studio' where id = v_store;
    update public.stores set store_model = 'content' where id = v_store;
    update public.stores set store_model = 'publisher' where id = v_store;
    begin update public.stores set store_model = 'galeria' where id = v_store; raise exception 'FALHOU 1: aceitou modelo inventado';
    exception when check_violation then null; end;

    -- 2) destaque: só a dona escolhe, e é UM por loja
    perform set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
    begin perform public.set_store_featured(v_store, p1); raise exception 'FALHOU 2a: estranho escolheu o destaque';
    exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    perform public.set_store_featured(v_store, p1);
    perform public.set_store_featured(v_store, p2);
    if (select count(*) from public.products where store_id = v_store and is_featured) <> 1 then raise exception 'FALHOU 2b: mais de um destaque'; end if;
    if not (select is_featured from public.products where id = p2) then raise exception 'FALHOU 2c: o destaque não trocou'; end if;
    perform public.set_store_featured(v_store, null);
    if exists (select 1 from public.products where store_id = v_store and is_featured) then raise exception 'FALHOU 2d: não tirou o destaque'; end if;

    -- 3) prévia de livro: documento-teaser só com o número de páginas; páginas fora de 1..50 recusadas
    v_ok := false;
    begin
        insert into public.digital_contents (product_id, owner_id, title, kind, storage_path, bucket, is_teaser)
        select id, v_owner, 'x', 'document', v_owner || '/x.pdf', 'digital-files', true from public.products where store_id = v_store and type = 'digital' limit 1;
    exception when check_violation then v_ok := true; end;
    if not v_ok then raise exception 'FALHOU 3a: prévia sem número de páginas entrou'; end if;
    v_ok := false;
    begin
        insert into public.digital_contents (product_id, owner_id, title, kind, storage_path, bucket, is_teaser, preview_pages)
        select id, v_owner, 'x', 'document', v_owner || '/x.pdf', 'digital-files', true, 51 from public.products where store_id = v_store and type = 'digital' limit 1;
    exception when check_violation then v_ok := true; end;
    if not v_ok then raise exception 'FALHOU 3b: prévia de 51 páginas entrou'; end if;

    raise notice 'OK: modelos de criador, destaque único da dona e regras da prévia de livro';
end $$;
rollback;
