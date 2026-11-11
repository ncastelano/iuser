-- Volta o limite do Pós-pago para R$ 50 escrito nas funções (desfaz 20261130000057).
DO $$
DECLARE r record; def text; novo text;
BEGIN
    FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
             WHERE ns.nspname = 'public' AND p.prokind = 'f' AND p.prosrc LIKE '%get_postpaid_debt_limit()%'
               AND p.proname <> 'get_postpaid_debt_limit'
    LOOP
        def := pg_get_functiondef(r.oid);
        novo := replace(def, 'public.get_postpaid_debt_limit()', '50');
        novo := replace(novo, 'Sua dívida do pós-pago chegou ao limite.', 'Sua dívida do pós-pago chegou a R$ 50.');
        novo := replace(novo, 'Você chegou ao limite de dívida do pós-pago.', 'Você está com R$ 50 ou mais em aberto no pós-pago.');
        IF novo <> def THEN EXECUTE novo; END IF;
    END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.get_postpaid_debt_limit();
DROP TABLE IF EXISTS public.postpaid_settings;
