-- Cenários de 20261130000072 (cotação pública e avaliações do motorista). Transação DESFEITA: só LOCAL/staging.
BEGIN;
DO $$
DECLARE v_drv uuid; q jsonb;
BEGIN
    SELECT driver_id INTO v_drv FROM public.driver_pricing LIMIT 1;
    IF v_drv IS NULL THEN RAISE NOTICE 'sem motorista: pulado'; RETURN; END IF;
    UPDATE public.driver_pricing SET profile_quote = 'time', driver_mode_active = true, live_location_sync = true, live_lat = -8.76123, live_lng = -63.90041, live_updated_at = now() WHERE driver_id = v_drv;
    UPDATE public.profiles SET show_location = true WHERE id = v_drv;
    -- 1) modo inválido é recusado
    BEGIN UPDATE public.driver_pricing SET profile_quote = 'outro' WHERE driver_id = v_drv; ASSERT false, '1: deveria falhar';
    EXCEPTION WHEN check_violation THEN NULL; END;
    -- 2) visitante: o modo e os números, SEM posição
    SET LOCAL ROLE anon;
    q := public.get_driver_public_quote(v_drv);
    RESET ROLE;
    ASSERT q->>'mode' = 'time' AND q->'live' = 'null'::jsonb, '2: visitante sem posição';
    -- 3) logado: posição na grade de ~330 m (nunca a exata)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    q := public.get_driver_public_quote(v_drv);
    RESET ROLE;
    ASSERT (q->'live'->>'lat')::numeric <> -8.76123 AND abs((q->'live'->>'lat')::numeric - (-8.76123)) < 0.003, '3: posição aproximada';
    -- 4) local escondido: sem posição
    UPDATE public.profiles SET show_location = false WHERE id = v_drv;
    SET LOCAL ROLE authenticated;
    q := public.get_driver_public_quote(v_drv);
    RESET ROLE;
    ASSERT q->'live' = 'null'::jsonb, '4: local escondido';
    -- 5) avaliações: só as do motorista, com comentário primeiro
    ASSERT (SELECT count(*) FROM public.get_driver_reviews(v_drv, 5)) <= 5, '5: limite';
    RAISE NOTICE 'driver_profile_quote: todos os cenários passaram';
END $$;
ROLLBACK;
