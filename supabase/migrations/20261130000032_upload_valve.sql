-- VÁLVULA DE SEGURANÇA DOS UPLOADS: desliga SOZINHA os tipos de envio mais pesados quando o armazenamento ou a banda do plano chegam perto da cota, e religa quando o uso volta a cair.
-- Por quê: em outubro a BANDA de download passou da cota grátis (13,94 GB de 5 GB) e o Supabase bloqueou a organização inteira; um limite por pessoa não impede isso. A válvula olha o TOTAL.
--   · MEDIÇÃO (a cada 10 min, pg_cron `upload-valve-tick`, e sob demanda no Admin): ARMAZENAMENTO = soma real dos arquivos em storage.objects; BANDA = o maior entre (a) a telemetria do app no ciclo
--     + a estimativa dos downloads de programas (tamanho × downloads) e (b) o valor que o admin digitou do painel do Supabase neste ciclo. A banda de arquivo baixado/música tocada NÃO é medida pelo app,
--     por isso existe o campo manual (confira o número no painel do Supabase de vez em quando). A cota vem de Financeiro (`supabase_usage_metrics.included_value`) quando preenchida; senão, daqui.
--   · DISPARO em 2 estágios: ≥ `trip_pct` (80%) desliga os de estágio 1 (digital: música, programa, curso/arquivos; vídeo/música do R2); ≥ `critical_pct` (95%) desliga também o de estágio 2 (Flash).
--     Foto de perfil, logo, produto, comunidade, prova de entrega etc. NUNCA são desligadas pela válvula (a loja precisa operar).
--   · RETORNO: só quando o uso cai a `resume_pct` (65%) ou menos (histerese: não fica ligando e desligando) e SÓ religa o que ela mesma desligou (`valve_disabled_at`); o que o admin desligou à mão fica.
--   · "Liberar por X horas" (`admin_upload_valve_override`): religa na hora e a válvula não dispara de novo até o prazo. Desligar a válvula também religa tudo.
--   · NASCE DESLIGADA (como a limpeza de órfãos): ligar é no painel, com confirmação. Desligada ela só MEDE (o painel mostra o quanto falta).
--   · cada disparo/retorno/escalada vira linha em `upload_valve_events` e em `admin_config_audit` (scope `upload_valve`); mudar configuração também audita. Tabelas sem acesso do app (tudo por função, só serviço).
-- Rollback: supabase/rollbacks/upload_valve_rollback.sql

ALTER TABLE public.upload_kinds ADD COLUMN IF NOT EXISTS valve_stage smallint;
ALTER TABLE public.upload_kinds DROP CONSTRAINT IF EXISTS upload_kinds_valve_stage_check;
ALTER TABLE public.upload_kinds ADD CONSTRAINT upload_kinds_valve_stage_check CHECK (valve_stage IS NULL OR valve_stage IN (1, 2));
ALTER TABLE public.upload_kinds ADD COLUMN IF NOT EXISTS valve_disabled_at timestamptz;
UPDATE public.upload_kinds SET valve_stage = 1 WHERE kind IN ('digital_music', 'digital_app', 'digital_file', 'media_r2') AND valve_stage IS NULL;
UPDATE public.upload_kinds SET valve_stage = 2 WHERE kind = 'flash_media' AND valve_stage IS NULL;

CREATE TABLE IF NOT EXISTS public.upload_valve_settings (
    id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
    enabled            boolean NOT NULL DEFAULT false,
    trip_pct           integer NOT NULL DEFAULT 80 CHECK (trip_pct BETWEEN 50 AND 99),
    critical_pct       integer NOT NULL DEFAULT 95 CHECK (critical_pct BETWEEN 60 AND 100),
    resume_pct         integer NOT NULL DEFAULT 65 CHECK (resume_pct BETWEEN 10 AND 95),
    storage_quota_gb   numeric NOT NULL DEFAULT 1 CHECK (storage_quota_gb > 0 AND storage_quota_gb <= 100000),
    egress_quota_gb    numeric NOT NULL DEFAULT 5 CHECK (egress_quota_gb > 0 AND egress_quota_gb <= 100000),
    cycle_day          integer NOT NULL DEFAULT 13 CHECK (cycle_day BETWEEN 1 AND 28),
    egress_manual_gb   numeric CHECK (egress_manual_gb IS NULL OR egress_manual_gb >= 0),
    egress_manual_cycle date,
    override_until     timestamptz,
    tripped_at         timestamptz,
    tripped_stage      smallint,
    tripped_reason     text,
    last_eval_at       timestamptz,
    last_storage_bytes bigint,
    last_egress_bytes  bigint,
    last_storage_pct   integer,
    last_egress_pct    integer,
    CONSTRAINT upload_valve_order_check CHECK (resume_pct < trip_pct AND trip_pct < critical_pct)
);
INSERT INTO public.upload_valve_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.upload_valve_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upload_valve_settings FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.upload_valve_events (
    id          bigserial PRIMARY KEY,
    at          timestamptz NOT NULL DEFAULT now(),
    action      text NOT NULL CHECK (action IN ('trip', 'escalate', 'resume', 'override', 'off')),
    stage       smallint,
    reason      text,
    storage_pct integer,
    egress_pct  integer,
    kinds       text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS upload_valve_events_at_idx ON public.upload_valve_events (at DESC);
ALTER TABLE public.upload_valve_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upload_valve_events FROM anon, authenticated;

-- início do ciclo de cobrança (o do Supabase vira no dia `cycle_day`, não no dia 1)
CREATE OR REPLACE FUNCTION public._upload_valve_cycle_start(p_cycle_day integer) RETURNS date LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN extract(day FROM current_date) >= p_cycle_day THEN date_trunc('month', current_date)::date + (p_cycle_day - 1)
                ELSE (date_trunc('month', current_date) - interval '1 month')::date + (p_cycle_day - 1) END
$$;

-- a medição: tudo em bytes e em %
CREATE OR REPLACE FUNCTION public._upload_valve_measure() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.upload_valve_settings; v_cycle date; v_storage bigint; v_tele bigint; v_dl bigint; v_manual bigint := 0; v_egress bigint; v_sq numeric; v_eq numeric; v_sq_src text := 'valve'; v_eq_src text := 'valve'; v_q numeric;
BEGIN
    SELECT * INTO s FROM public.upload_valve_settings WHERE id;
    v_cycle := public._upload_valve_cycle_start(s.cycle_day);
    SELECT COALESCE(sum((metadata->>'size')::bigint), 0)::bigint INTO v_storage FROM storage.objects;
    SELECT COALESCE(sum(egress_bytes), 0)::bigint INTO v_tele FROM public.usage_telemetry_daily WHERE day >= v_cycle;
    SELECT COALESCE(sum(c.size_bytes), 0)::bigint INTO v_dl FROM public.digital_downloads d JOIN public.digital_contents c ON c.id = d.item_id WHERE d.day >= v_cycle;
    IF s.egress_manual_gb IS NOT NULL AND s.egress_manual_cycle = v_cycle THEN v_manual := (s.egress_manual_gb * 1073741824)::bigint; END IF;
    v_egress := GREATEST(v_tele + v_dl, v_manual);
    v_sq := s.storage_quota_gb; v_eq := s.egress_quota_gb;
    IF to_regclass('public.supabase_usage_metrics') IS NOT NULL THEN
        EXECUTE 'SELECT included_value FROM public.supabase_usage_metrics WHERE metric_name = $1' INTO v_q USING 'Armazenamento (Storage)';
        IF v_q IS NOT NULL AND v_q > 0 THEN v_sq := v_q; v_sq_src := 'financeiro'; END IF;
        v_q := NULL;
        EXECUTE 'SELECT included_value FROM public.supabase_usage_metrics WHERE metric_name = $1' INTO v_q USING 'Largura de banda (Egress)';
        IF v_q IS NOT NULL AND v_q > 0 THEN v_eq := v_q; v_eq_src := 'financeiro'; END IF;
    END IF;
    RETURN jsonb_build_object('cycle_start', v_cycle,
        'storage_bytes', v_storage, 'storage_quota_bytes', (v_sq * 1073741824)::bigint, 'storage_quota_source', v_sq_src, 'storage_pct', LEAST(999, round(v_storage * 100.0 / (v_sq * 1073741824)))::int,
        'egress_bytes', v_egress, 'egress_quota_bytes', (v_eq * 1073741824)::bigint, 'egress_quota_source', v_eq_src, 'egress_pct', LEAST(999, round(v_egress * 100.0 / (v_eq * 1073741824)))::int,
        'egress_parts', jsonb_build_object('telemetry', v_tele, 'downloads', v_dl, 'manual', v_manual));
END $$;
REVOKE ALL ON FUNCTION public._upload_valve_measure() FROM PUBLIC, anon, authenticated;

-- religa o que a válvula desligou (e só isso); devolve os tipos
CREATE OR REPLACE FUNCTION public._upload_valve_release() RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r text[];
BEGIN
    WITH u AS (UPDATE public.upload_kinds SET enabled = true, valve_disabled_at = NULL WHERE valve_disabled_at IS NOT NULL RETURNING kind)
    SELECT COALESCE(array_agg(kind ORDER BY kind), '{}') INTO r FROM u;
    UPDATE public.upload_valve_settings SET tripped_at = NULL, tripped_stage = NULL, tripped_reason = NULL WHERE id;
    RETURN r;
END $$;
REVOKE ALL ON FUNCTION public._upload_valve_release() FROM PUBLIC, anon, authenticated;

-- o cérebro: mede, e (se a válvula está ligada) dispara, escala ou religa. Cron a cada 10 min; o painel chama sob demanda.
CREATE OR REPLACE FUNCTION public.upload_valve_tick() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.upload_valve_settings; m jsonb; sp integer; ep integer; v_pct integer; v_stage integer; v_reason text; v_kinds text[]; v_action text := 'watching';
BEGIN
    SELECT * INTO s FROM public.upload_valve_settings WHERE id FOR UPDATE;
    m := public._upload_valve_measure();
    sp := (m->>'storage_pct')::int; ep := (m->>'egress_pct')::int; v_pct := GREATEST(sp, ep);
    v_reason := CASE WHEN sp >= ep THEN 'storage' ELSE 'egress' END;
    UPDATE public.upload_valve_settings SET last_eval_at = now(), last_storage_bytes = (m->>'storage_bytes')::bigint, last_egress_bytes = (m->>'egress_bytes')::bigint, last_storage_pct = sp, last_egress_pct = ep WHERE id;
    DELETE FROM public.upload_valve_events WHERE at < now() - interval '180 days';

    IF NOT s.enabled THEN v_action := 'off';
    ELSIF s.override_until IS NOT NULL AND now() < s.override_until THEN v_action := 'override';
    ELSE
        v_stage := CASE WHEN v_pct >= s.critical_pct THEN 2 WHEN v_pct >= s.trip_pct THEN 1 ELSE 0 END;
        IF s.tripped_at IS NULL THEN
            IF v_stage > 0 THEN
                WITH u AS (UPDATE public.upload_kinds SET enabled = false, valve_disabled_at = now() WHERE valve_stage IS NOT NULL AND valve_stage <= v_stage AND enabled AND valve_disabled_at IS NULL RETURNING kind)
                SELECT COALESCE(array_agg(kind ORDER BY kind), '{}') INTO v_kinds FROM u;
                UPDATE public.upload_valve_settings SET tripped_at = now(), tripped_stage = v_stage, tripped_reason = v_reason WHERE id;
                INSERT INTO public.upload_valve_events (action, stage, reason, storage_pct, egress_pct, kinds) VALUES ('trip', v_stage, v_reason, sp, ep, v_kinds);
                INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('upload_valve', 'trip', NULL, jsonb_build_object('stage', v_stage, 'reason', v_reason, 'storage_pct', sp, 'egress_pct', ep, 'kinds', v_kinds), NULL);
                v_action := 'trip';
            END IF;
        ELSIF v_pct <= s.resume_pct THEN
            v_kinds := public._upload_valve_release();
            INSERT INTO public.upload_valve_events (action, reason, storage_pct, egress_pct, kinds) VALUES ('resume', v_reason, sp, ep, v_kinds);
            INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('upload_valve', 'resume', NULL, jsonb_build_object('storage_pct', sp, 'egress_pct', ep, 'kinds', v_kinds), NULL);
            v_action := 'resume';
        ELSIF v_stage > COALESCE(s.tripped_stage, 0) THEN
            WITH u AS (UPDATE public.upload_kinds SET enabled = false, valve_disabled_at = now() WHERE valve_stage IS NOT NULL AND valve_stage <= v_stage AND enabled AND valve_disabled_at IS NULL RETURNING kind)
            SELECT COALESCE(array_agg(kind ORDER BY kind), '{}') INTO v_kinds FROM u;
            UPDATE public.upload_valve_settings SET tripped_stage = v_stage, tripped_reason = v_reason WHERE id;
            INSERT INTO public.upload_valve_events (action, stage, reason, storage_pct, egress_pct, kinds) VALUES ('escalate', v_stage, v_reason, sp, ep, v_kinds);
            INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('upload_valve', 'escalate', NULL, jsonb_build_object('stage', v_stage, 'reason', v_reason, 'storage_pct', sp, 'egress_pct', ep, 'kinds', v_kinds), NULL);
            v_action := 'escalate';
        END IF;
    END IF;
    RETURN jsonb_build_object('action', v_action, 'storage_pct', sp, 'egress_pct', ep, 'kinds', COALESCE(v_kinds, '{}'));
END $$;
REVOKE ALL ON FUNCTION public.upload_valve_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upload_valve_tick() TO service_role;

-- o painel: configuração + medição + tipos sob a válvula + histórico
CREATE OR REPLACE FUNCTION public.admin_upload_valve_status() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.upload_valve_settings;
BEGIN
    SELECT * INTO s FROM public.upload_valve_settings WHERE id;
    RETURN jsonb_build_object('settings', to_jsonb(s), 'measure', public._upload_valve_measure(),
        'kinds', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', k.kind, 'label', k.label, 'stage', k.valve_stage, 'enabled', k.enabled, 'paused', k.valve_disabled_at IS NOT NULL, 'paused_at', k.valve_disabled_at) ORDER BY k.valve_stage NULLS LAST, k.label) FROM public.upload_kinds k), '[]'::jsonb),
        'events', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.at DESC) FROM (SELECT * FROM public.upload_valve_events ORDER BY at DESC LIMIT 15) e), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_upload_valve_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_valve_status() TO service_role;

-- configuração (só campos conhecidos; os valores e a ordem 65 < 80 < 95 são conferidos pelo CHECK da tabela, no conjunto); cada mudança é auditada. Desligar a válvula religa o que ela tinha desligado.
CREATE OR REPLACE FUNCTION public.admin_upload_valve_update(p_patch jsonb, p_admin uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.upload_valve_settings; n public.upload_valve_settings; k text; v_kinds text[]; v_cycle_day integer;
BEGIN
    IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN RAISE EXCEPTION 'Alteração inválida' USING ERRCODE = '22023'; END IF;
    FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
        IF k NOT IN ('enabled', 'trip_pct', 'critical_pct', 'resume_pct', 'storage_quota_gb', 'egress_quota_gb', 'cycle_day', 'egress_manual_gb') THEN RAISE EXCEPTION 'Campo não editável: %', k USING ERRCODE = '22023'; END IF;
    END LOOP;
    SELECT * INTO s FROM public.upload_valve_settings WHERE id FOR UPDATE;
    v_cycle_day := COALESCE((p_patch->>'cycle_day')::integer, s.cycle_day);
    UPDATE public.upload_valve_settings SET
        enabled = COALESCE((p_patch->>'enabled')::boolean, enabled),
        trip_pct = COALESCE((p_patch->>'trip_pct')::integer, trip_pct),
        critical_pct = COALESCE((p_patch->>'critical_pct')::integer, critical_pct),
        resume_pct = COALESCE((p_patch->>'resume_pct')::integer, resume_pct),
        storage_quota_gb = COALESCE((p_patch->>'storage_quota_gb')::numeric, storage_quota_gb),
        egress_quota_gb = COALESCE((p_patch->>'egress_quota_gb')::numeric, egress_quota_gb),
        cycle_day = v_cycle_day,
        -- a banda digitada vale para o ciclo de agora; null apaga
        egress_manual_gb = CASE WHEN p_patch ? 'egress_manual_gb' THEN (p_patch->>'egress_manual_gb')::numeric ELSE egress_manual_gb END,
        egress_manual_cycle = CASE WHEN p_patch ? 'egress_manual_gb' THEN CASE WHEN p_patch->>'egress_manual_gb' IS NULL THEN NULL ELSE public._upload_valve_cycle_start(v_cycle_day) END ELSE egress_manual_cycle END
      WHERE id RETURNING * INTO n;
    FOR k IN SELECT jsonb_object_keys(p_patch) LOOP
        IF (to_jsonb(s) -> k) IS DISTINCT FROM (to_jsonb(n) -> k) THEN
            INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('upload_valve', k, to_jsonb(s) -> k, to_jsonb(n) -> k, p_admin);
        END IF;
    END LOOP;
    -- desligar a válvula religa o que ela tinha desligado (senão ficaria tudo parado para sempre) e apaga a liberação por tempo
    IF s.enabled AND NOT n.enabled THEN
        UPDATE public.upload_valve_settings SET override_until = NULL WHERE id;   -- uma liberação antiga não pode mascarar um disparo futuro
        v_kinds := public._upload_valve_release();
        IF COALESCE(array_length(v_kinds, 1), 0) > 0 THEN INSERT INTO public.upload_valve_events (action, kinds, reason) VALUES ('off', v_kinds, 'valve_off'); END IF;
    END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_upload_valve_update(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_valve_update(jsonb, uuid) TO service_role;

-- "liberar por X horas": religa já e a válvula não dispara de novo até o prazo
CREATE OR REPLACE FUNCTION public.admin_upload_valve_override(p_hours integer, p_admin uuid) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_until timestamptz; v_kinds text[]; m jsonb;
BEGIN
    IF p_hours IS NULL OR p_hours < 1 OR p_hours > 168 THEN RAISE EXCEPTION 'Escolha de 1 a 168 horas' USING ERRCODE = '22023'; END IF;
    v_until := now() + make_interval(hours => p_hours);
    UPDATE public.upload_valve_settings SET override_until = v_until WHERE id;
    v_kinds := public._upload_valve_release();
    m := public._upload_valve_measure();
    INSERT INTO public.upload_valve_events (action, reason, storage_pct, egress_pct, kinds) VALUES ('override', 'manual', (m->>'storage_pct')::int, (m->>'egress_pct')::int, v_kinds);
    INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('upload_valve', 'override', NULL, jsonb_build_object('hours', p_hours, 'until', v_until, 'kinds', v_kinds), p_admin);
    RETURN v_until;
END $$;
REVOKE ALL ON FUNCTION public.admin_upload_valve_override(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_valve_override(integer, uuid) TO service_role;

-- em que estágio cada tipo entra (ou nenhum: fora da válvula)
CREATE OR REPLACE FUNCTION public.admin_upload_valve_kind(p_kind text, p_stage integer, p_admin uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old smallint;
BEGIN
    IF p_stage IS NOT NULL AND p_stage NOT IN (1, 2) THEN RAISE EXCEPTION 'Estágio inválido' USING ERRCODE = '22023'; END IF;
    SELECT valve_stage INTO v_old FROM public.upload_kinds WHERE kind = p_kind FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Tipo não encontrado' USING ERRCODE = '22023'; END IF;
    UPDATE public.upload_kinds SET valve_stage = p_stage WHERE kind = p_kind;
    IF v_old IS DISTINCT FROM p_stage::smallint THEN INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by) VALUES ('upload_valve', 'kind.' || p_kind, to_jsonb(v_old), to_jsonb(p_stage), p_admin); END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_upload_valve_kind(text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upload_valve_kind(text, integer, uuid) TO service_role;

-- a pessoa vê o motivo: tipo PAUSADO pela válvula (get_my_upload_limits ganha a coluna `paused`)
DROP FUNCTION IF EXISTS public.get_my_upload_limits();
CREATE FUNCTION public.get_my_upload_limits()
RETURNS TABLE (kind text, label text, bucket text, provider text, enabled boolean, max_bytes bigint, per_hour_files integer, per_day_bytes bigint, per_user_bytes bigint,
               used_bytes bigint, used_files bigint, used_day_bytes bigint, paused boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT k.kind, k.label, k.bucket, k.provider, k.enabled, k.max_bytes, k.per_hour_files, k.per_day_bytes, k.per_user_bytes,
           COALESCE(sum(m.bytes) FILTER (WHERE m.state = 'ready'), 0)::bigint,
           (count(m.id) FILTER (WHERE m.state = 'ready'))::bigint,
           COALESCE(sum(m.bytes) FILTER (WHERE m.state = 'ready' AND m.created_at > now() - interval '24 hours'), 0)::bigint,
           (k.valve_disabled_at IS NOT NULL AND NOT k.enabled)
      FROM public.upload_kinds k
      LEFT JOIN public.media_assets m ON m.kind = k.kind AND m.owner_id = auth.uid()
     WHERE auth.uid() IS NOT NULL
     GROUP BY k.kind
     ORDER BY k.label;
$$;
REVOKE ALL ON FUNCTION public.get_my_upload_limits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_upload_limits() TO authenticated;

-- a recusa de envio diz que foi a válvula (para a tela explicar em vez de "desativado")
CREATE OR REPLACE FUNCTION public.authorize_upload(p_bucket text, p_path text, p_bytes bigint, p_mime text, p_upsert boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    r      jsonb;
    v_uid  uuid := auth.uid();
    v_kind text;
BEGIN
    r := public._authorize_upload_core(p_bucket, p_path, p_bytes, p_mime, p_upsert);
    IF v_uid IS NOT NULL AND COALESCE((r->>'ok')::boolean, false) IS NOT TRUE AND COALESCE(r->>'error', '') <> 'not_authenticated' THEN
        SELECT k.kind INTO v_kind FROM public.upload_kinds k WHERE k.bucket = p_bucket ORDER BY k.enabled DESC, k.kind LIMIT 1;
        PERFORM public._upload_log_denial(v_uid, v_kind, COALESCE(r->>'error', 'unknown'));
        IF r->>'error' = 'kind_disabled' AND EXISTS (SELECT 1 FROM public.upload_kinds k WHERE k.bucket = p_bucket AND k.valve_disabled_at IS NOT NULL AND NOT k.enabled) THEN r := r || jsonb_build_object('valve', true); END IF;
    END IF;
    RETURN r;
END $$;

-- vigia a cada 10 minutos
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'upload-valve-tick';
SELECT cron.schedule('upload-valve-tick', '*/10 * * * *', $job$SELECT public.upload_valve_tick()$job$);
