-- Telemetria própria genérica (não é bytes/tempo, é contagem de chamada)
-- pra qualquer serviço externo que a gente queira acompanhar sem ter uma
-- API de uso pública pra puxar — mesmo raciocínio de usage_telemetry_daily
-- (Egress/Realtime do Supabase), mas reaproveitável: um dia + serviço +
-- métrica (ex: 'mapbox'/'directions', 'firebase'/'fcm_sends') com contagem
-- somada. Usado pelas abas Mapbox e Firebase do Financeiro.
CREATE TABLE IF NOT EXISTS public.service_usage_telemetry_daily (
    day DATE NOT NULL,
    service TEXT NOT NULL,
    metric TEXT NOT NULL,
    count BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (day, service, metric)
);

ALTER TABLE public.service_usage_telemetry_daily ENABLE ROW LEVEL SECURITY;
-- Sem policy de SELECT/INSERT pra client: só o admin lê (via service role
-- nas rotas /api/admin/expenses/*) e só a função abaixo escreve.

CREATE OR REPLACE FUNCTION public.track_service_usage(p_service TEXT, p_metric TEXT, p_count INT DEFAULT 1)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.service_usage_telemetry_daily (day, service, metric, count, updated_at)
    VALUES (current_date, p_service, p_metric, p_count, now())
    ON CONFLICT (day, service, metric)
    DO UPDATE SET count = service_usage_telemetry_daily.count + p_count, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.track_service_usage(TEXT, TEXT, INT) FROM public;
-- anon/authenticated: chamadas de Mapbox acontecem no navegador (Directions/
-- Optimization API, ver src/lib/mapboxRoute.ts). service_role: chamadas do
-- Firebase acontecem no servidor (src/lib/firebaseAdmin.ts), via supabaseAdmin.
GRANT EXECUTE ON FUNCTION public.track_service_usage(TEXT, TEXT, INT) TO anon, authenticated, service_role;
