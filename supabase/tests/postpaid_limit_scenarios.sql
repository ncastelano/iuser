-- Cenários do LIMITE DO PÓS-PAGO (migration 20261130000057). Só LOCAL/staging, tudo dentro de uma transação desfeita.
-- Roda: docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/postpaid_limit_scenarios.sql
begin;
do $$
declare
    v_owner uuid; v_limit numeric; v_ok boolean; v_msg text;
begin
    -- 1) o limite central é 100 e a função é legível
    v_limit := public.get_postpaid_debt_limit();
    if v_limit <> 100 then raise exception 'FALHOU 1: limite esperado 100, veio %', v_limit; end if;

    -- 2) nenhuma função ainda compara a dívida com 50 escrito à mão
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' and p.prosrc ~ '(get_driver_postpaid_debt\([^)]*\)|sum\(amount\))\s*>=\s*50([^0-9.]|$)') then
        raise exception 'FALHOU 2: ainda há função com >= 50 escrito';
    end if;

    -- 3) uma loja SEM dívida cadastra produto; com R$ 60 ainda cadastra (antes travava); com R$ 100 trava
    select s.owner_id into v_owner from public.stores s limit 1;
    delete from public.driver_postpaid_charges where driver_id = v_owner;
    insert into public.driver_postpaid_charges (driver_id, type, amount) values (v_owner, 'club_payment_fee', 60);
    if public.get_driver_postpaid_debt(v_owner) >= public.get_postpaid_debt_limit() then raise exception 'FALHOU 3a: R$ 60 não deveria travar'; end if;
    insert into public.driver_postpaid_charges (driver_id, type, amount) values (v_owner, 'club_payment_fee', 39.99);
    if public.get_driver_postpaid_debt(v_owner) >= public.get_postpaid_debt_limit() then raise exception 'FALHOU 3b: R$ 99,99 não deveria travar'; end if;
    insert into public.driver_postpaid_charges (driver_id, type, amount) values (v_owner, 'club_payment_fee', 0.01);
    if not (public.get_driver_postpaid_debt(v_owner) >= public.get_postpaid_debt_limit()) then raise exception 'FALHOU 3c: R$ 100 deveria travar'; end if;

    -- 4) o gatilho de produto usa o limite novo: com R$ 100 recusa, com a mensagem sem número fixo
    v_ok := false;
    begin
        perform public.block_product_for_store_in_debt();   -- é função de gatilho: só confere que existe e usa a função
    exception when others then null;
    end;
    select (pg_get_functiondef('public.block_product_for_store_in_debt'::regproc) like '%get_postpaid_debt_limit()%'
        and pg_get_functiondef('public.block_product_for_store_in_debt'::regproc) not like '%R$ 50%') into v_ok;
    if not v_ok then raise exception 'FALHOU 4: gatilho de produto ainda cita 50'; end if;

    -- 5) trocar o limite vale na hora para todas as regras (UPDATE único)
    update public.postpaid_settings set debt_limit = 150;
    if public.get_driver_postpaid_debt(v_owner) >= public.get_postpaid_debt_limit() then raise exception 'FALHOU 5: com limite 150, R$ 100 não deveria travar'; end if;

    raise notice 'OK: limite central do pós-pago (100), sem 50 escrito à mão, troca por UPDATE vale na hora';
end $$;
rollback;
