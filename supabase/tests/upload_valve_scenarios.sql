-- Cenários da VÁLVULA DE SEGURANÇA DOS UPLOADS (migration 20261130000032). Roda LOCAL, numa transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/upload_valve_scenarios.sql
BEGIN;
DO $$
DECLARE
    v_admin uuid; v_user uuid; v_m jsonb; v_r jsonb; v_bytes bigint; v_n integer; v_s record; v_hint text; v_cycle date;
    -- põe a cota de armazenamento para o uso de agora dar ~p% (a válvula mede o storage de verdade)
    p_set CONSTANT text := 'x';
BEGIN
    SELECT id INTO v_admin FROM profiles ORDER BY id LIMIT 1;
    SELECT id INTO v_user FROM profiles WHERE id <> v_admin ORDER BY id LIMIT 1;
    -- sem a tabela do Financeiro preenchida, a cota vem da própria válvula (aqui o teste manda)
    IF to_regclass('public.supabase_usage_metrics') IS NOT NULL THEN DELETE FROM public.supabase_usage_metrics WHERE metric_name IN ('Armazenamento (Storage)', 'Largura de banda (Egress)'); END IF;
    -- garante algum arquivo para medir
    v_bytes := (_upload_valve_measure()->>'storage_bytes')::bigint;
    IF v_bytes < 1000 THEN RAISE EXCEPTION 'FALHA 0: sem arquivos no Storage para medir'; END IF;
    UPDATE usage_telemetry_daily SET egress_bytes = 0 WHERE day >= current_date - 40;   -- banda "limpa" (a medição do teste só olha o armazenamento)

    -- 1) padrão: nasce desligada, 80/95/65, e os tipos pesados já têm estágio (foto e prova de entrega ficam fora)
    SELECT * INTO v_s FROM upload_valve_settings;
    IF v_s.enabled OR v_s.trip_pct <> 80 OR v_s.critical_pct <> 95 OR v_s.resume_pct <> 65 OR v_s.cycle_day <> 13 THEN RAISE EXCEPTION 'FALHA 1: padrão %', v_s; END IF;
    IF (SELECT array_agg(kind ORDER BY kind) FROM upload_kinds WHERE valve_stage = 1) <> ARRAY['digital_app', 'digital_file', 'digital_music', 'media_r2'] THEN RAISE EXCEPTION 'FALHA 1b: estágio 1'; END IF;
    IF (SELECT array_agg(kind) FROM upload_kinds WHERE valve_stage = 2) <> ARRAY['flash_media'] THEN RAISE EXCEPTION 'FALHA 1c: estágio 2'; END IF;
    IF EXISTS (SELECT 1 FROM upload_kinds WHERE kind IN ('avatar', 'store_logo', 'product_photo', 'delivery_proof', 'community_photo') AND valve_stage IS NOT NULL) THEN RAISE EXCEPTION 'FALHA 1d: tipo essencial sob a válvula'; END IF;

    -- 2) desligada ela só MEDE: nada é mexido mesmo com o uso estourado
    PERFORM admin_upload_valve_update(jsonb_build_object('storage_quota_gb', (v_bytes / 1073741824.0 / 2.0)), v_admin);   -- ~200%
    v_r := upload_valve_tick();
    IF v_r->>'action' <> 'off' OR EXISTS (SELECT 1 FROM upload_kinds WHERE valve_disabled_at IS NOT NULL) THEN RAISE EXCEPTION 'FALHA 2: desligada mexeu em tipos (%)', v_r; END IF;
    IF (SELECT last_storage_pct FROM upload_valve_settings) < 150 THEN RAISE EXCEPTION 'FALHA 2b: não registrou a medição'; END IF;

    -- 3) ligada com ~85%: dispara o estágio 1 (digital) e NÃO o Flash; o que o admin já tinha desligado (media_r2) não é tocado
    UPDATE upload_kinds SET enabled = false WHERE kind = 'media_r2';
    PERFORM admin_upload_valve_update(jsonb_build_object('enabled', true, 'storage_quota_gb', (v_bytes / 1073741824.0 / 0.85)), v_admin);
    v_r := upload_valve_tick();
    IF v_r->>'action' <> 'trip' THEN RAISE EXCEPTION 'FALHA 3: não disparou (%)', v_r; END IF;
    IF (SELECT count(*) FROM upload_kinds WHERE valve_disabled_at IS NOT NULL AND NOT enabled) <> 3 THEN RAISE EXCEPTION 'FALHA 3b: estágio 1 desligou %', (SELECT array_agg(kind) FROM upload_kinds WHERE valve_disabled_at IS NOT NULL); END IF;
    IF NOT (SELECT enabled FROM upload_kinds WHERE kind = 'flash_media') OR NOT (SELECT enabled FROM upload_kinds WHERE kind = 'product_photo') THEN RAISE EXCEPTION 'FALHA 3c: mexeu em tipo que não é do estágio 1'; END IF;
    IF (SELECT valve_disabled_at FROM upload_kinds WHERE kind = 'media_r2') IS NOT NULL THEN RAISE EXCEPTION 'FALHA 3d: marcou como da válvula o que o admin já tinha desligado'; END IF;
    IF (SELECT tripped_stage FROM upload_valve_settings) <> 1 OR (SELECT tripped_reason FROM upload_valve_settings) <> 'storage' THEN RAISE EXCEPTION 'FALHA 3e: estado'; END IF;
    -- repetir o tick não dispara de novo
    IF upload_valve_tick()->>'action' <> 'watching' THEN RAISE EXCEPTION 'FALHA 3f: disparou duas vezes'; END IF;

    -- 4) a pessoa: o envio é recusado dizendo que foi a válvula; o "meu espaço" mostra pausado
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    v_r := authorize_upload('digital-music', v_user || '/p/faixa.mp3', 1000, 'audio/mpeg');
    IF v_r->>'error' <> 'kind_disabled' OR (v_r->>'valve')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FALHA 4: recusa sem dizer a válvula (%)', v_r; END IF;
    IF NOT (SELECT paused FROM get_my_upload_limits() WHERE kind = 'digital_music') OR (SELECT paused FROM get_my_upload_limits() WHERE kind = 'product_photo') THEN RAISE EXCEPTION 'FALHA 4b: pausado no meu espaço'; END IF;
    -- um tipo desligado pelo admin (não pela válvula) NÃO ganha o aviso da válvula
    IF authorize_upload('iuser-media', v_user || '/p/v.mp4', 1000, 'video/mp4') ? 'valve' THEN RAISE EXCEPTION 'FALHA 4c: aviso da válvula num tipo do admin'; END IF;
    RESET ROLE;

    -- 5) ~97%: escala e desliga também o Flash
    PERFORM admin_upload_valve_update(jsonb_build_object('storage_quota_gb', (v_bytes / 1073741824.0 / 0.97)), v_admin);
    v_r := upload_valve_tick();
    IF v_r->>'action' <> 'escalate' OR (SELECT enabled FROM upload_kinds WHERE kind = 'flash_media') OR (SELECT tripped_stage FROM upload_valve_settings) <> 2 THEN RAISE EXCEPTION 'FALHA 5: escalada (%)', v_r; END IF;

    -- 6) histerese: em ~75% (entre 65 e 80) NADA religa
    PERFORM admin_upload_valve_update(jsonb_build_object('storage_quota_gb', (v_bytes / 1073741824.0 / 0.75)), v_admin);
    IF upload_valve_tick()->>'action' <> 'watching' OR (SELECT count(*) FROM upload_kinds WHERE valve_disabled_at IS NOT NULL) <> 4 THEN RAISE EXCEPTION 'FALHA 6: religou cedo demais'; END IF;

    -- 7) em ~50% religa só o que ela desligou; o media_r2 do admin continua desligado
    PERFORM admin_upload_valve_update(jsonb_build_object('storage_quota_gb', (v_bytes / 1073741824.0 / 0.50)), v_admin);
    v_r := upload_valve_tick();
    IF v_r->>'action' <> 'resume' OR EXISTS (SELECT 1 FROM upload_kinds WHERE valve_disabled_at IS NOT NULL) THEN RAISE EXCEPTION 'FALHA 7: não religou (%)', v_r; END IF;
    IF NOT (SELECT bool_and(enabled) FROM upload_kinds WHERE kind IN ('digital_music', 'digital_app', 'digital_file', 'flash_media')) OR (SELECT enabled FROM upload_kinds WHERE kind = 'media_r2') THEN RAISE EXCEPTION 'FALHA 7b: religou o que não era dela'; END IF;
    IF (SELECT tripped_at FROM upload_valve_settings) IS NOT NULL THEN RAISE EXCEPTION 'FALHA 7c: ainda marcada como disparada'; END IF;

    -- 8) liberar por X horas: religa já e não dispara de novo até o prazo
    PERFORM admin_upload_valve_update(jsonb_build_object('storage_quota_gb', (v_bytes / 1073741824.0 / 0.90)), v_admin);
    IF upload_valve_tick()->>'action' <> 'trip' THEN RAISE EXCEPTION 'FALHA 8: não disparou de novo'; END IF;
    PERFORM admin_upload_valve_override(2, v_admin);
    IF EXISTS (SELECT 1 FROM upload_kinds WHERE valve_disabled_at IS NOT NULL) OR NOT (SELECT enabled FROM upload_kinds WHERE kind = 'digital_music') THEN RAISE EXCEPTION 'FALHA 8b: liberar não religou'; END IF;
    IF upload_valve_tick()->>'action' <> 'override' OR EXISTS (SELECT 1 FROM upload_kinds WHERE valve_disabled_at IS NOT NULL) THEN RAISE EXCEPTION 'FALHA 8c: disparou durante a liberação'; END IF;
    BEGIN PERFORM admin_upload_valve_override(0, v_admin); RAISE EXCEPTION 'FALHA 8d: aceitou 0 hora';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    UPDATE upload_valve_settings SET override_until = NULL;

    -- 9) desligar a válvula com tipos desligados por ela religa tudo
    IF upload_valve_tick()->>'action' <> 'trip' THEN RAISE EXCEPTION 'FALHA 9: não disparou'; END IF;
    PERFORM admin_upload_valve_update(jsonb_build_object('enabled', false), v_admin);
    IF EXISTS (SELECT 1 FROM upload_kinds WHERE valve_disabled_at IS NOT NULL) OR NOT (SELECT enabled FROM upload_kinds WHERE kind = 'digital_app') OR (SELECT tripped_at FROM upload_valve_settings) IS NOT NULL THEN RAISE EXCEPTION 'FALHA 9b: desligar a válvula não religou'; END IF;
    -- 9c) uma liberação por tempo some ao desligar (senão mascararia um disparo depois de religar)
    PERFORM admin_upload_valve_update(jsonb_build_object('enabled', true), v_admin);
    PERFORM admin_upload_valve_override(24, v_admin);
    PERFORM admin_upload_valve_update(jsonb_build_object('enabled', false), v_admin);
    IF (SELECT override_until FROM upload_valve_settings) IS NOT NULL THEN RAISE EXCEPTION 'FALHA 9c: liberação ficou depois de desligar'; END IF;
    PERFORM admin_upload_valve_update(jsonb_build_object('enabled', true), v_admin);

    -- 10) configuração: campo estranho e ordem 65 < 80 < 95 recusados (nada fica pela metade); o que muda é auditado
    BEGIN PERFORM admin_upload_valve_update(jsonb_build_object('tripped_at', now()), v_admin); RAISE EXCEPTION 'FALHA 10: campo interno editado';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN PERFORM admin_upload_valve_update(jsonb_build_object('trip_pct', 60), v_admin); RAISE EXCEPTION 'FALHA 10b: aceitou disparo (60) abaixo do retorno (65)';
    EXCEPTION WHEN check_violation THEN NULL; END;
    PERFORM admin_upload_valve_update(jsonb_build_object('trip_pct', 85, 'critical_pct', 98, 'resume_pct', 70), v_admin);
    SELECT * INTO v_s FROM upload_valve_settings;
    IF v_s.trip_pct <> 85 OR v_s.critical_pct <> 98 OR v_s.resume_pct <> 70 THEN RAISE EXCEPTION 'FALHA 10c: três limiares juntos'; END IF;
    IF NOT EXISTS (SELECT 1 FROM admin_config_audit WHERE scope = 'upload_valve' AND setting = 'trip_pct' AND (new_value)::text = '85' AND changed_by = v_admin) THEN RAISE EXCEPTION 'FALHA 10d: sem auditoria'; END IF;
    IF NOT EXISTS (SELECT 1 FROM admin_config_audit WHERE scope = 'upload_valve' AND setting = 'trip') OR NOT EXISTS (SELECT 1 FROM admin_config_audit WHERE scope = 'upload_valve' AND setting = 'resume') THEN RAISE EXCEPTION 'FALHA 10e: disparo/retorno sem auditoria'; END IF;
    SELECT count(*) INTO v_n FROM upload_valve_events WHERE action IN ('trip', 'escalate', 'resume', 'override', 'off');
    IF v_n < 6 THEN RAISE EXCEPTION 'FALHA 10f: histórico (% eventos)', v_n; END IF;

    -- 11) a banda: o número que o admin digita do painel do Supabase vale para o ciclo de agora (e só nele)
    PERFORM admin_upload_valve_update(jsonb_build_object('storage_quota_gb', 100000, 'egress_quota_gb', 5, 'trip_pct', 80, 'critical_pct', 95, 'resume_pct', 65, 'egress_manual_gb', 4.5), v_admin);
    v_m := _upload_valve_measure();
    IF (v_m->>'egress_pct')::int NOT BETWEEN 89 AND 91 THEN RAISE EXCEPTION 'FALHA 11: banda manual = %', v_m->>'egress_pct'; END IF;
    UPDATE upload_valve_settings SET egress_manual_cycle = _upload_valve_cycle_start(13) - 40;   -- número de um ciclo antigo: ignorado
    IF (_upload_valve_measure()->>'egress_pct')::int > 5 THEN RAISE EXCEPTION 'FALHA 11b: usou a banda manual de outro ciclo'; END IF;
    PERFORM admin_upload_valve_update(jsonb_build_object('enabled', true, 'egress_manual_gb', 4.5), v_admin);
    v_r := upload_valve_tick();
    IF v_r->>'action' <> 'trip' OR (SELECT tripped_reason FROM upload_valve_settings) <> 'egress' THEN RAISE EXCEPTION 'FALHA 11c: disparo pela banda (%)', v_r; END IF;
    PERFORM admin_upload_valve_update(jsonb_build_object('enabled', false), v_admin);

    -- 12) o início do ciclo: o do Supabase vira no dia 13
    IF _upload_valve_cycle_start(13) > current_date OR _upload_valve_cycle_start(13) <= current_date - 32 OR extract(day FROM _upload_valve_cycle_start(13)) <> 13 THEN RAISE EXCEPTION 'FALHA 12: início do ciclo'; END IF;

    -- 13) só o servidor mexe (conferido pelo catálogo: chamar função sem permissão derruba o Postgres LOCAL)
    IF has_function_privilege('authenticated', 'public.upload_valve_tick()', 'EXECUTE') OR has_function_privilege('anon', 'public.upload_valve_tick()', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.admin_upload_valve_status()', 'EXECUTE') OR has_function_privilege('authenticated', 'public.admin_upload_valve_update(jsonb, uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.admin_upload_valve_override(integer, uuid)', 'EXECUTE') OR has_function_privilege('authenticated', 'public.admin_upload_valve_kind(text, integer, uuid)', 'EXECUTE')
       OR has_table_privilege('authenticated', 'public.upload_valve_settings', 'SELECT') OR has_table_privilege('authenticated', 'public.upload_valve_events', 'SELECT') THEN RAISE EXCEPTION 'FALHA 13: usuário alcança a válvula'; END IF;
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'upload-valve-tick' AND schedule = '*/10 * * * *') THEN RAISE EXCEPTION 'FALHA 13b: sem a rotina de 10 em 10 minutos'; END IF;

    RAISE EXCEPTION 'RESULT: OK (cenários da válvula dos uploads passaram)';
END $$;
ROLLBACK;
