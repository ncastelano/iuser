-- Cenários do teto mensal do Pós-pago (migration 20261130000075). Transação DESFEITA: só LOCAL/staging.
-- Rodar: docker exec -i -e PGPASSWORD supabase_db_iuser-local psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/tests/postpaid_monthly_cap_scenarios.sql
BEGIN;
DO $$
DECLARE v_p uuid; v_amt numeric; i int;
BEGIN
    SELECT id INTO v_p FROM public.profiles ORDER BY created_at DESC LIMIT 1;
    DELETE FROM public.driver_postpaid_charges WHERE driver_id = v_p;
    UPDATE public.postpaid_settings SET monthly_cap = 2;
    -- 1) até o teto, cobra normal
    FOR i IN 1..3 LOOP INSERT INTO public.driver_postpaid_charges (driver_id, type, amount) VALUES (v_p, 'service_fee', 0.5); END LOOP;
    ASSERT public._postpaid_month_charged(v_p) = 1.5, '1: 1,50 cobrado';
    -- 2) a que passa do teto é cortada no que falta; as seguintes entram com 0
    INSERT INTO public.driver_postpaid_charges (driver_id, type, amount) VALUES (v_p, 'service_fee', 0.8) RETURNING amount INTO v_amt;
    ASSERT v_amt = 0.5, '2a: cortada no que falta (0,50), veio ' || v_amt;
    INSERT INTO public.driver_postpaid_charges (driver_id, type, amount) VALUES (v_p, 'service_fee', 0.5) RETURNING amount INTO v_amt;
    ASSERT v_amt = 0, '2b: passou do teto: 0';
    ASSERT public._postpaid_month_charged(v_p) = 2, '2c: nunca mais que o teto';
    -- 3) pagamento (negativo) não conta nem é mexido
    INSERT INTO public.driver_postpaid_charges (driver_id, type, amount, asaas_payment_id) VALUES (v_p, 'payment', -2, 'teste-' || gen_random_uuid()) RETURNING amount INTO v_amt;
    ASSERT v_amt = -2, '3: pagamento intacto';
    ASSERT public._postpaid_month_charged(v_p) = 2, '3b: o mês continua no teto';
    -- 4) cobrança do mês passado não conta
    UPDATE public.driver_postpaid_charges SET created_at = now() - interval '40 days' WHERE driver_id = v_p AND type <> 'payment';
    ASSERT public._postpaid_month_charged(v_p) = 0, '4: mês novo, conta zerada';
    -- 5) sem teto: cobra tudo
    UPDATE public.postpaid_settings SET monthly_cap = NULL;
    INSERT INTO public.driver_postpaid_charges (driver_id, type, amount) VALUES (v_p, 'service_fee', 5) RETURNING amount INTO v_amt;
    ASSERT v_amt = 5, '5: sem teto';
    RAISE NOTICE 'postpaid_monthly_cap: todos os cenários passaram';
END $$;
ROLLBACK;
