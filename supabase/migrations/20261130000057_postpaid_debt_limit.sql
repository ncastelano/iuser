-- 20261130000057_postpaid_debt_limit.sql
--
-- LIMITE DE DÍVIDA DO PÓS-PAGO: de R$ 50 (escrito à mão em ~10 funções) para UMA regra central, hoje R$ 100.
-- Decisão do dono (09/11/2026): "mais oportunidade para as pessoas". Quando a dívida do Pós-pago chega no limite, a pessoa precisa quitar
-- para continuar (cadastrar produto, publicar, agendar, aceitar corrida, anunciar imóvel, registrar venda...). A quitação continua sendo
-- o valor REALMENTE devido (a cobrança Pix nunca é fixa): o limite só decide quando trava.
--
-- Como: (1) tabela de uma linha + função get_postpaid_debt_limit() (leitura pública, é só um número); (2) um bloco que REESCREVE, no banco
-- em que rodar, as funções que ainda comparam a dívida com 50, trocando pela função — assim vale igual no local, no staging e na produção
-- sem copiar 10 corpos de função; (3) as mensagens deixam de citar o número. Trocar o limite depois = um UPDATE em postpaid_settings.

CREATE TABLE IF NOT EXISTS public.postpaid_settings (
    id         boolean PRIMARY KEY DEFAULT true CHECK (id),
    debt_limit numeric(10,2) NOT NULL DEFAULT 100 CHECK (debt_limit >= 1),
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.postpaid_settings (id, debt_limit) VALUES (true, 100) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.postpaid_settings ENABLE ROW LEVEL SECURITY;      -- sem políticas: ninguém lê a tabela direto, só pela função
REVOKE ALL ON public.postpaid_settings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_postpaid_debt_limit()
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE((SELECT debt_limit FROM public.postpaid_settings WHERE id), 100)
$$;
REVOKE ALL ON FUNCTION public.get_postpaid_debt_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_postpaid_debt_limit() TO anon, authenticated, service_role;

DO $$
DECLARE
    r record;
    def text;
    novo text;
    n int := 0;
BEGIN
    FOR r IN
        SELECT p.oid, p.oid::regprocedure::text AS nome
        FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
        WHERE ns.nspname = 'public' AND p.prokind = 'f'
          AND p.prosrc ~ '(get_driver_postpaid_debt\([^)]*\)|sum\(amount\))\s*>=\s*50([^0-9.]|$)'
    LOOP
        def := pg_get_functiondef(r.oid);
        novo := regexp_replace(def, '(get_driver_postpaid_debt\([^)]*\)|sum\(amount\))\s*>=\s*50([^0-9.]|$)', '\1 >= public.get_postpaid_debt_limit()\2', 'g');
        -- mensagens: não citam mais o número (ele agora é configurável)
        novo := replace(novo, 'Sua dívida do pós-pago chegou a R$ 50.', 'Sua dívida do pós-pago chegou ao limite.');
        novo := replace(novo, 'Você está com R$ 50 ou mais em aberto no pós-pago.', 'Você chegou ao limite de dívida do pós-pago.');
        IF novo <> def THEN
            EXECUTE novo;
            n := n + 1;
            RAISE NOTICE 'limite do pós-pago agora central em %', r.nome;
        END IF;
    END LOOP;
    RAISE NOTICE 'funções reescritas: %', n;
END $$;
