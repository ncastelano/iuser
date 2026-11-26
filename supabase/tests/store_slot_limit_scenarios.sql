-- Cenários do limite de lojas (20261130000129). Roda em transação desfeita, SÓ no banco local/staging.
-- Uso: docker exec -i supabase_db_iuser-local psql -U postgres -d postgres -f supabase/tests/store_slot_limit_scenarios.sql
begin;
do $$
declare
    v_uid uuid := gen_random_uuid();
    v_n integer;
    v_ok boolean;
begin
    -- a pessoa de teste (auth.users mínimo) e as claims que o auth.uid() lê
    insert into auth.users (id, email) values (v_uid, 'slot-test-' || v_uid || '@test.local');
    perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);

    -- 1) 3 lojas sem plano: liberadas
    for i in 1..3 loop
        perform public.create_store_with_access(jsonb_build_object('name', 'Loja ' || i, 'storeSlug', 'slot-teste-' || v_uid || '-' || i));
    end loop;
    select count(*) into v_n from public.stores where owner_id = v_uid;
    assert v_n = 3, 'esperava 3 lojas, achei ' || v_n;

    -- 2) a 4ª é recusada com o código store_limit
    v_ok := false;
    begin
        perform public.create_store_with_access(jsonb_build_object('name', 'Loja 4', 'storeSlug', 'slot-teste-' || v_uid || '-4'));
    exception when others then
        v_ok := (sqlerrm like 'Você já tem 3 lojas%');
    end;
    assert v_ok, 'a 4ª loja deveria ser recusada';

    -- 3) liberação paga (vira o limite de 4) e a 4ª passa; a 5ª volta a ser recusada
    reset role;
    insert into public.store_slot_grants (profile_id, source, note) values (v_uid, 'admin', 'teste');
    perform set_config('role', 'authenticated', true);
    perform public.create_store_with_access(jsonb_build_object('name', 'Loja 4', 'storeSlug', 'slot-teste-' || v_uid || '-4'));
    select count(*) into v_n from public.stores where owner_id = v_uid;
    assert v_n = 4, 'com 1 liberação deveria haver 4 lojas, achei ' || v_n;

    -- 4) o painel da pessoa enxerga o limite
    assert (public.my_store_slots() ->> 'allowed')::int = 4, 'my_store_slots deveria dizer 4 lojas permitidas';
    raise notice 'store_slot_limit: OK (3 grátis, 4ª recusada, liberação paga abre a 4ª)';
end $$;
rollback;
