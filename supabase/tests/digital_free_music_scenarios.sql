-- Cenários do DIGITAL GRÁTIS + MÚSICA (migration 20261130000027). Roda LOCAL, numa transação desfeita:
--   docker exec -i supabase_db_iuser-local psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/digital_free_music_scenarios.sql
BEGIN;
DO $$
DECLARE
    v_store uuid; v_owner uuid; v_stranger uuid; v_free uuid; v_paid uuid; v_track uuid; v_clip uuid; v_err text; v_n integer; v_teaser uuid;
BEGIN
    SELECT s.id, s.owner_id INTO v_store, v_owner FROM stores s WHERE s."storeSlug" = 'pizzaria-forno-de-ouro';
    SELECT id INTO v_stranger FROM profiles WHERE id <> v_owner LIMIT 1;

    -- preparo (como serviço): um álbum grátis e um pago, com uma faixa em cada
    INSERT INTO products (name, slug, price, type, store_id, owner_id, is_active) VALUES ('Álbum grátis de teste', 'album-gratis-teste-x', 0, 'digital', v_store, v_owner, true) RETURNING id INTO v_free;
    INSERT INTO products (name, slug, price, type, store_id, owner_id, is_active) VALUES ('Single pago de teste', 'single-pago-teste-x', 5, 'digital', v_store, v_owner, true) RETURNING id INTO v_paid;
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, position) VALUES (v_free, v_owner, 'Faixa 1', 'audio', 'digital-music', v_owner || '/x/faixa1.mp3', 0) RETURNING id INTO v_track;
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, position) VALUES (v_paid, v_owner, 'Faixa paga', 'audio', 'digital-music', v_owner || '/x/paga.mp3', 0);

    PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;

    -- 1) antes de pegar: sem acesso, a faixa não abre e a biblioteca não tem o álbum
    IF my_digital_access(v_free) THEN RAISE EXCEPTION 'FALHA 1: já tinha acesso'; END IF;
    IF (get_digital_item_access(v_track)->>'allowed')::boolean THEN RAISE EXCEPTION 'FALHA 1b: faixa abriu sem acesso'; END IF;

    -- 2) pegar o grátis: acesso, faixa abre, entra na biblioteca; repetir não duplica
    PERFORM claim_free_digital(v_free);
    PERFORM claim_free_digital(v_free);
    IF NOT my_digital_access(v_free) THEN RAISE EXCEPTION 'FALHA 2: sem acesso depois de pegar'; END IF;
    IF NOT (get_digital_item_access(v_track)->>'allowed')::boolean THEN RAISE EXCEPTION 'FALHA 2b: faixa não abriu'; END IF;
    SELECT count(*) INTO v_n FROM get_my_digital_library() WHERE product_id = v_free;
    IF v_n <> 1 THEN RAISE EXCEPTION 'FALHA 2c: biblioteca (%)', v_n; END IF;

    -- 3) produto pago não se pega de graça
    BEGIN PERFORM claim_free_digital(v_paid); RAISE EXCEPTION 'FALHA 3: pegou um produto pago';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_err = PG_EXCEPTION_HINT; IF v_err <> 'not_free' THEN RAISE; END IF; END;
    IF my_digital_access(v_paid) THEN RAISE EXCEPTION 'FALHA 3b: acesso ao pago'; END IF;

    -- 4) ninguém lê nem escreve as tabelas direto
    BEGIN PERFORM 1 FROM digital_claims LIMIT 1; RAISE EXCEPTION 'FALHA 4: leu digital_claims';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN INSERT INTO digital_claims (profile_id, product_id) VALUES (v_stranger, v_paid); RAISE EXCEPTION 'FALHA 4b: gravou digital_claims';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN PERFORM 1 FROM digital_rights LIMIT 1; RAISE EXCEPTION 'FALHA 4c: leu digital_rights';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    -- 5) a autoria: quem não publica não declara; o dono precisa declarar antes do primeiro áudio
    BEGIN PERFORM declare_digital_rights(v_free); RAISE EXCEPTION 'FALHA 5: outra pessoa declarou';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF has_digital_rights(v_free) THEN RAISE EXCEPTION 'FALHA 5b: já declarado'; END IF;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, position) VALUES (v_free, v_owner, 'Faixa 2', 'audio', 'digital-music', v_owner || '/x/faixa2.mp3', 1);
        RAISE EXCEPTION 'FALHA 5c: áudio entrou sem declaração';
    EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS v_err = PG_EXCEPTION_HINT; IF v_err <> 'rights_declaration_required' THEN RAISE; END IF; END;
    -- documento não precisa de declaração
    INSERT INTO digital_contents (product_id, owner_id, title, kind, storage_path, position) VALUES (v_free, v_owner, 'Cifra', 'document', v_owner || '/x/cifra.pdf', 2);
    PERFORM declare_digital_rights(v_free);
    IF NOT has_digital_rights(v_free) THEN RAISE EXCEPTION 'FALHA 5d: declaração não gravou'; END IF;
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, position) VALUES (v_free, v_owner, 'Faixa 2', 'audio', 'digital-music', v_owner || '/x/faixa2.mp3', 1);

    -- 6) prévia em áudio: 1–30 s; mais que isso é recusado; aparece para qualquer pessoa, fora do sumário
    INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, duration_seconds, is_teaser, position) VALUES (v_free, v_owner, 'Prévia', 'audio', 'digital-music', v_owner || '/x/previa.mp3', 28, true, 0) RETURNING id INTO v_teaser;
    BEGIN INSERT INTO digital_contents (product_id, owner_id, title, kind, bucket, storage_path, duration_seconds, is_teaser, position) VALUES (v_free, v_owner, 'Prévia longa', 'audio', 'digital-music', v_owner || '/x/longa.mp3', 45, true, 0);
        RAISE EXCEPTION 'FALHA 6: prévia de 45 s aceita';
    EXCEPTION WHEN check_violation THEN NULL; END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', v_stranger::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    IF (SELECT item_id FROM get_digital_audio_preview(v_free)) IS DISTINCT FROM v_teaser THEN RAISE EXCEPTION 'FALHA 6b: prévia não apareceu'; END IF;
    IF EXISTS (SELECT 1 FROM get_digital_curriculum(v_free) WHERE id = v_teaser) THEN RAISE EXCEPTION 'FALHA 6c: prévia no sumário'; END IF;
    IF NOT (get_digital_item_access(v_teaser)->>'allowed')::boolean THEN RAISE EXCEPTION 'FALHA 6d: prévia não abre'; END IF;
    -- o pago, sem a prévia, segue fechado para quem não comprou
    IF (SELECT count(*) FROM get_digital_audio_preview(v_paid)) <> 0 THEN RAISE EXCEPTION 'FALHA 6e: prévia inexistente apareceu'; END IF;

    RAISE EXCEPTION 'RESULT: OK (cenários de digital grátis + música passaram)';
END $$;
ROLLBACK;
