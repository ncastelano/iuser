-- Cenários do flash com local (migration 20261130000070). Transação DESFEITA: só LOCAL/staging.
-- Rodar: docker exec -i -e PGPASSWORD=postgres supabase_db_iuser-local psql -h 127.0.0.1 -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/tests/flash_location_scenarios.sql
BEGIN;
DO $$
DECLARE v_author uuid; v_id uuid; f record; v_n int;
BEGIN
    SELECT p.id INTO v_author FROM public.profiles p WHERE COALESCE(p.is_active, true) AND NOT COALESCE(p.is_blocked, false) LIMIT 1;
    -- 1) o local nunca é gravado exato (grade de ~330 m) e o número da casa sai do texto
    INSERT INTO public.flashes (author_id, content, place_lat, place_lng, place_label)
    VALUES (v_author, 'teste do radar', -8.761234, -63.903456, 'Rua Açaí, 1234, Jardim Eldorado') RETURNING * INTO f;
    ASSERT abs(f.place_lat - (-8.760)) < 0.0005 AND abs(f.place_lng - (-63.903)) < 0.0005, '1a: arredondado ' || f.place_lat || ',' || f.place_lng;
    ASSERT f.place_label = 'Rua Açaí, Jardim Eldorado', '1b: sem o número: ' || f.place_label;
    v_id := f.id;
    -- 2) aparece no radar perto, some longe ou velho
    SELECT count(*) INTO v_n FROM public.get_radar_flashes(-8.76, -63.90, 5, 72, 200) r WHERE r.id = v_id;
    ASSERT v_n = 1, '2a: aparece perto';
    SELECT count(*) INTO v_n FROM public.get_radar_flashes(-10.9, -61.9, 15, 72, 200) r WHERE r.id = v_id;
    ASSERT v_n = 0, '2b: não aparece longe';
    UPDATE public.flashes SET created_at = now() - interval '5 days' WHERE id = v_id;
    SELECT count(*) INTO v_n FROM public.get_radar_flashes(-8.76, -63.90, 5, 72, 200) r WHERE r.id = v_id;
    ASSERT v_n = 0, '2c: velho some';
    UPDATE public.flashes SET created_at = now() WHERE id = v_id;
    -- 3) o feed traz o lugar; flash sem local não vai ao radar
    SELECT count(*) INTO v_n FROM public.get_flash_feed('all', 50, NULL, 'flash') g WHERE g.id = v_id AND g.place_label = 'Rua Açaí, Jardim Eldorado';
    ASSERT v_n = 1, '3a: feed com o lugar';
    INSERT INTO public.flashes (author_id, content) VALUES (v_author, 'sem local') RETURNING id INTO v_id;
    SELECT count(*) INTO v_n FROM public.get_radar_flashes(-8.76, -63.90, 50, 720, 200) r WHERE r.id = v_id;
    ASSERT v_n = 0, '3b: sem local não vai ao radar';
    -- 4) texto sem posição é recusado
    BEGIN
        INSERT INTO public.flashes (author_id, content, place_label) VALUES (v_author, 'x', 'Centro');
        ASSERT false, '4: deveria recusar lugar sem posição';
    EXCEPTION WHEN check_violation THEN NULL; END;
    RAISE NOTICE 'flash_location: todos os cenários passaram';
END $$;
ROLLBACK;
