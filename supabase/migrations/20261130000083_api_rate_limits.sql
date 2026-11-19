-- 20261130000083_api_rate_limits.sql
--
-- LIMITE DE TENTATIVAS COMPARTILHADO (18/11/2026, revisão antes de comercializar). As rotas do servidor contavam as tentativas na
-- MEMÓRIA de cada instância (src/lib/rateLimit.ts): na Vercel cada instância tem a sua conta, então um ataque espalhado passava.
-- Agora as rotas sensíveis (checagem de CPF no cadastro, prévia de links) contam também no BANCO, uma conta só para todas:
--   rate_limit_hit(chave, máximo, janela em segundos) → true = pode; false = passou do limite. Janela fixa (começa na 1ª tentativa).
-- Só o servidor chama (service_role). A chave já vem com o IP do servidor; nada é guardado além da chave e da contagem; limpeza diária.
-- Rollback: supabase/rollbacks/api_rate_limits_rollback.sql.

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
    key          text PRIMARY KEY CHECK (length(key) <= 200),
    window_start timestamptz NOT NULL DEFAULT now(),
    hits         int NOT NULL DEFAULT 0
);
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_max int, p_window_s int) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hits int;
BEGIN
    IF p_key IS NULL OR p_max < 1 OR p_window_s < 1 THEN RETURN false; END IF;
    INSERT INTO public.api_rate_limits AS r (key, window_start, hits) VALUES (left(p_key, 200), now(), 1)
    ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN r.window_start < now() - make_interval(secs => p_window_s) THEN 1 ELSE r.hits + 1 END,
        window_start = CASE WHEN r.window_start < now() - make_interval(secs => p_window_s) THEN now() ELSE r.window_start END
    RETURNING hits INTO v_hits;
    RETURN v_hits <= p_max;
END; $$;
REVOKE ALL ON FUNCTION public.rate_limit_hit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(text, int, int) TO service_role;

CREATE OR REPLACE FUNCTION public.api_rate_limits_purge() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    DELETE FROM public.api_rate_limits WHERE window_start < now() - interval '2 days';
$$;
REVOKE ALL ON FUNCTION public.api_rate_limits_purge() FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'api-rate-limits-purge';
        PERFORM cron.schedule('api-rate-limits-purge', '37 3 * * *', 'select public.api_rate_limits_purge()');
    END IF;
END $$;
