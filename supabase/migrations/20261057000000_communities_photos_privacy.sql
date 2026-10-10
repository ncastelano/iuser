-- Comunidades: foto, privacidade (aparece na lista ou só por link), entrada livre ou por senha, e a campanha diária de
-- troca de foto das comunidades de lugar (cidade/estado/país): qualquer membro envia uma foto, os membros votam e,
-- à meia-noite do lugar, a mais votada vira a foto da comunidade. A contagem dos votos só aparece pra quem já votou.

ALTER TABLE public.communities
    ADD COLUMN IF NOT EXISTS image_url text,
    ADD COLUMN IF NOT EXISTS is_listed boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS requires_password boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'custom',
    ADD COLUMN IF NOT EXISTS tz text NOT NULL DEFAULT 'America/Sao_Paulo';

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communities_kind_check') THEN
        ALTER TABLE public.communities ADD CONSTRAINT communities_kind_check CHECK (kind IN ('place', 'custom'));
    END IF;
END $$;

-- As que já existiam como chat de um lugar (nome = cidade/estado/país) são "place"
UPDATE public.communities SET kind = 'place' WHERE lower(name) = lower(city) AND kind = 'custom';
-- Rondônia tem horário de Porto Velho
UPDATE public.communities SET tz = 'America/Porto_Velho'
WHERE lower(city) IN ('porto velho', 'rondônia', 'rondonia') AND tz = 'America/Sao_Paulo';

-- Senha: o hash fica numa tabela sem nenhuma policy (só as funções abaixo leem)
CREATE TABLE IF NOT EXISTS public.community_secrets (
    community_id uuid PRIMARY KEY REFERENCES public.communities(id) ON DELETE CASCADE,
    password_hash text NOT NULL
);
ALTER TABLE public.community_secrets ENABLE ROW LEVEL SECURITY;

-- Quem é membro (ou criador) de uma comunidade
CREATE OR REPLACE FUNCTION public._community_is_member(p_community uuid, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_user IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.community_members m WHERE m.community_id = p_community AND m.profile_id = p_user)
        OR EXISTS (SELECT 1 FROM public.communities c WHERE c.id = p_community AND c.creator_id = p_user)
    );
$$;
REVOKE ALL ON FUNCTION public._community_is_member(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._community_is_member(uuid, uuid) TO anon, authenticated, service_role;

-- Comunidade com senha: só membro lê e escreve as mensagens; entrar só pela função join_community
DROP POLICY IF EXISTS "Mensagens são públicas" ON public.community_messages;
CREATE POLICY "Ler mensagens (senha exige ser membro)" ON public.community_messages FOR SELECT
    USING (
        NOT EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.requires_password)
        OR public._community_is_member(community_id, auth.uid())
    );

DROP POLICY IF EXISTS "Enviar mensagem" ON public.community_messages;
CREATE POLICY "Enviar mensagem" ON public.community_messages FOR INSERT
    WITH CHECK (
        auth.uid() = profile_id
        AND (
            NOT EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.requires_password)
            OR public._community_is_member(community_id, auth.uid())
        )
    );

DROP POLICY IF EXISTS "Entrar em comunidade" ON public.community_members;
CREATE POLICY "Entrar em comunidade sem senha" ON public.community_members FOR INSERT
    WITH CHECK (
        auth.uid() = profile_id
        AND NOT EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_id AND c.requires_password)
    );

-- Entrar (com senha, quando a comunidade pede)
CREATE OR REPLACE FUNCTION public.join_community(p_community uuid, p_password text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_user uuid := auth.uid(); c public.communities; v_hash text;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta pra participar'; END IF;
    SELECT * INTO c FROM public.communities WHERE id = p_community;
    IF NOT FOUND THEN RAISE EXCEPTION 'Comunidade não encontrada'; END IF;
    IF c.requires_password THEN
        SELECT password_hash INTO v_hash FROM public.community_secrets WHERE community_id = c.id;
        IF v_hash IS NULL OR COALESCE(p_password, '') = '' OR crypt(p_password, v_hash) <> v_hash THEN
            RAISE EXCEPTION 'Senha incorreta';
        END IF;
    END IF;
    INSERT INTO public.community_members (community_id, profile_id) VALUES (c.id, v_user)
    ON CONFLICT (community_id, profile_id) DO NOTHING;
    RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.join_community(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.join_community(uuid, text) TO authenticated;

-- Criar comunidade (limite de 3 por pessoa; o criador entra como membro)
CREATE OR REPLACE FUNCTION public.create_community(
    p_name text, p_description text, p_scope text, p_place text,
    p_listed boolean, p_password text, p_image_url text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_user uuid := auth.uid(); v_slug text; v_base text; v_try int := 0; v_id uuid; v_count int;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta pra criar uma comunidade'; END IF;
    IF btrim(COALESCE(p_name, '')) = '' THEN RAISE EXCEPTION 'Dê um nome à comunidade'; END IF;
    IF p_scope NOT IN ('city', 'state', 'country') THEN RAISE EXCEPTION 'Escolha onde a comunidade aparece'; END IF;
    IF btrim(COALESCE(p_place, '')) = '' THEN RAISE EXCEPTION 'Não achei o lugar. Defina seu local primeiro'; END IF;
    SELECT count(*) INTO v_count FROM public.communities WHERE creator_id = v_user AND kind = 'custom';
    IF v_count >= 3 THEN RAISE EXCEPTION 'Você já criou o máximo de 3 comunidades'; END IF;

    v_base := regexp_replace(lower(public.unaccent(btrim(p_name))), '[^a-z0-9]+', '-', 'g');
    v_base := btrim(v_base, '-');
    IF v_base = '' THEN v_base := 'comunidade'; END IF;
    v_slug := v_base;
    WHILE EXISTS (SELECT 1 FROM public.communities WHERE slug = v_slug) LOOP
        v_try := v_try + 1;
        v_slug := v_base || '-' || (v_try + 1);
    END LOOP;

    INSERT INTO public.communities (slug, name, city, description, creator_id, scope, is_listed, requires_password, image_url, kind)
    VALUES (v_slug, btrim(p_name), btrim(p_place), NULLIF(btrim(COALESCE(p_description, '')), ''), v_user, p_scope,
            COALESCE(p_listed, true), COALESCE(btrim(p_password), '') <> '', NULLIF(p_image_url, ''), 'custom')
    RETURNING id INTO v_id;

    IF COALESCE(btrim(p_password), '') <> '' THEN
        INSERT INTO public.community_secrets (community_id, password_hash) VALUES (v_id, crypt(btrim(p_password), gen_salt('bf')));
    END IF;
    INSERT INTO public.community_members (community_id, profile_id) VALUES (v_id, v_user);
    RETURN v_slug;
END; $$;
REVOKE ALL ON FUNCTION public.create_community(text, text, text, text, boolean, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_community(text, text, text, text, boolean, text, text) TO authenticated;

-- ===== Foto da comunidade de lugar: candidatas e votos do dia =====
CREATE TABLE IF NOT EXISTS public.community_photo_candidates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
    proposer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    image_url text NOT NULL,
    round_day date NOT NULL,
    outcome text,                       -- null = ainda em votação; 'winner' | 'lost' depois da meia-noite
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (community_id, round_day, proposer_id)
);
CREATE INDEX IF NOT EXISTS community_photo_candidates_open_idx ON public.community_photo_candidates (community_id, round_day) WHERE outcome IS NULL;

CREATE TABLE IF NOT EXISTS public.community_photo_votes (
    community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
    round_day date NOT NULL,
    voter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    candidate_id uuid NOT NULL REFERENCES public.community_photo_candidates(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (community_id, round_day, voter_id)
);
ALTER TABLE public.community_photo_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_photo_votes ENABLE ROW LEVEL SECURITY;
-- sem policies: tudo pelas funções abaixo (o voto de cada um e a contagem não vazam)

-- O dia local da comunidade (a meia-noite é a dela)
CREATE OR REPLACE FUNCTION public._community_today(p_community uuid)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT (now() AT TIME ZONE COALESCE((SELECT tz FROM public.communities WHERE id = p_community), 'America/Sao_Paulo'))::date;
$$;

-- Fecha as votações de dias que já passaram: a mais votada vira a foto (empate: a que chegou primeiro; sem voto, fica a atual)
CREATE OR REPLACE FUNCTION public._community_close_rounds(p_community uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_today date := public._community_today(p_community); d record; w record;
BEGIN
    FOR d IN
        SELECT DISTINCT round_day FROM public.community_photo_candidates
        WHERE community_id = p_community AND outcome IS NULL AND round_day < v_today
        ORDER BY round_day
    LOOP
        SELECT cand.id, cand.image_url, count(v.voter_id) AS votes INTO w
        FROM public.community_photo_candidates cand
        LEFT JOIN public.community_photo_votes v ON v.candidate_id = cand.id
        WHERE cand.community_id = p_community AND cand.round_day = d.round_day
        GROUP BY cand.id, cand.image_url, cand.created_at
        ORDER BY count(v.voter_id) DESC, cand.created_at ASC
        LIMIT 1;

        UPDATE public.community_photo_candidates SET outcome = 'lost'
        WHERE community_id = p_community AND round_day = d.round_day AND outcome IS NULL;
        IF w.id IS NOT NULL AND w.votes > 0 THEN
            UPDATE public.community_photo_candidates SET outcome = 'winner' WHERE id = w.id;
            UPDATE public.communities SET image_url = w.image_url WHERE id = p_community;
        END IF;
    END LOOP;
END; $$;

-- A campanha de hoje, do ponto de vista de quem está olhando.
-- Já ordenada por votos (quem tem mais fica na frente), mas a CONTAGEM só aparece depois que a pessoa vota.
CREATE OR REPLACE FUNCTION public.get_photo_campaign(p_community uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_user uuid := auth.uid(); c public.communities; v_today date; v_member boolean; v_voted uuid; v_has boolean; v_list jsonb;
BEGIN
    SELECT * INTO c FROM public.communities WHERE id = p_community;
    IF NOT FOUND THEN RETURN NULL; END IF;
    PERFORM public._community_close_rounds(p_community);
    SELECT * INTO c FROM public.communities WHERE id = p_community;
    v_today := public._community_today(p_community);
    v_member := public._community_is_member(p_community, v_user);
    SELECT candidate_id INTO v_voted FROM public.community_photo_votes
    WHERE community_id = p_community AND round_day = v_today AND voter_id = v_user;
    v_has := v_voted IS NOT NULL;

    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.rank_votes DESC, t.created_at ASC), '[]'::jsonb) INTO v_list
    FROM (
        SELECT cand.id, cand.image_url, cand.created_at,
               (cand.proposer_id = v_user) AS is_mine,
               (cand.id = v_voted) AS my_vote,
               pr."profileSlug" AS proposer_slug,
               (SELECT count(*) FROM public.community_photo_votes v WHERE v.candidate_id = cand.id) AS rank_votes,
               CASE WHEN v_has THEN (SELECT count(*) FROM public.community_photo_votes v WHERE v.candidate_id = cand.id) ELSE NULL END AS votes
        FROM public.community_photo_candidates cand
        JOIN public.profiles pr ON pr.id = cand.proposer_id
        WHERE cand.community_id = p_community AND cand.round_day = v_today AND cand.outcome IS NULL
    ) t;

    -- rank_votes só ordenava: não sai no resultado
    RETURN jsonb_build_object(
        'current_image', c.image_url,
        'kind', c.kind,
        'is_member', v_member,
        'has_voted', v_has,
        'candidates', (SELECT COALESCE(jsonb_agg(e - 'rank_votes'), '[]'::jsonb) FROM jsonb_array_elements(v_list) e)
    );
END; $$;
REVOKE ALL ON FUNCTION public.get_photo_campaign(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_photo_campaign(uuid) TO anon, authenticated;

-- Enviar uma foto pra votação de hoje (uma por pessoa por dia; enviar de novo troca a anterior)
CREATE OR REPLACE FUNCTION public.propose_community_photo(p_community uuid, p_image_url text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); c public.communities; v_today date; v_id uuid; v_n int;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    SELECT * INTO c FROM public.communities WHERE id = p_community;
    IF NOT FOUND THEN RAISE EXCEPTION 'Comunidade não encontrada'; END IF;
    IF c.kind <> 'place' THEN RAISE EXCEPTION 'A foto dessa comunidade é escolhida por quem a criou'; END IF;
    IF NOT public._community_is_member(p_community, v_user) THEN RAISE EXCEPTION 'Entre na comunidade primeiro'; END IF;
    IF COALESCE(btrim(p_image_url), '') = '' THEN RAISE EXCEPTION 'Foto inválida'; END IF;
    PERFORM public._community_close_rounds(p_community);
    v_today := public._community_today(p_community);

    SELECT count(*) INTO v_n FROM public.community_photo_candidates
    WHERE community_id = p_community AND round_day = v_today AND outcome IS NULL AND proposer_id <> v_user;
    IF v_n >= 12 THEN RAISE EXCEPTION 'A votação de hoje já tem fotos demais. Tente amanhã'; END IF;

    DELETE FROM public.community_photo_candidates
    WHERE community_id = p_community AND round_day = v_today AND proposer_id = v_user AND outcome IS NULL;
    INSERT INTO public.community_photo_candidates (community_id, proposer_id, image_url, round_day)
    VALUES (p_community, v_user, p_image_url, v_today) RETURNING id INTO v_id;
    RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.propose_community_photo(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.propose_community_photo(uuid, text) TO authenticated;

-- Votar (um voto por pessoa por dia; pode trocar o voto enquanto o dia não acaba)
CREATE OR REPLACE FUNCTION public.vote_community_photo(p_candidate uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); cand public.community_photo_candidates; v_today date;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta pra votar'; END IF;
    SELECT * INTO cand FROM public.community_photo_candidates WHERE id = p_candidate;
    IF NOT FOUND THEN RAISE EXCEPTION 'Foto não encontrada'; END IF;
    IF NOT public._community_is_member(cand.community_id, v_user) THEN RAISE EXCEPTION 'Entre na comunidade primeiro'; END IF;
    v_today := public._community_today(cand.community_id);
    IF cand.round_day <> v_today OR cand.outcome IS NOT NULL THEN RAISE EXCEPTION 'Essa votação já terminou'; END IF;
    INSERT INTO public.community_photo_votes (community_id, round_day, voter_id, candidate_id)
    VALUES (cand.community_id, cand.round_day, v_user, cand.id)
    ON CONFLICT (community_id, round_day, voter_id) DO UPDATE SET candidate_id = EXCLUDED.candidate_id, created_at = now();
    RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.vote_community_photo(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.vote_community_photo(uuid) TO authenticated;

-- Comunidade criada por alguém: o criador troca a foto direto
CREATE OR REPLACE FUNCTION public.set_community_image(p_community uuid, p_image_url text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.communities SET image_url = NULLIF(p_image_url, '')
    WHERE id = p_community AND creator_id = auth.uid() AND kind = 'custom';
    RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.set_community_image(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_community_image(uuid, text) TO authenticated;

-- Fotos (arquivos): cada pessoa envia na própria pasta
INSERT INTO storage.buckets (id, name, public) VALUES ('community-photos', 'community-photos', true)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Community Photos Public Read" ON storage.objects;
CREATE POLICY "Community Photos Public Read" ON storage.objects FOR SELECT USING (bucket_id = 'community-photos');
DROP POLICY IF EXISTS "Community Photos Own Upload" ON storage.objects;
CREATE POLICY "Community Photos Own Upload" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'community-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
