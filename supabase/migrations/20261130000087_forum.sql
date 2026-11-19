-- 20261130000087_forum.sql
--
-- FÓRUM DO iUSER (19/11/2026, decisão do dono: "algo que faça as pessoas ficarem perto do iUser"). Página /forum com:
--   - NOVIDADES (forum_releases): o que mudou em cada versão — o que ENTROU, o que MELHOROU e o que SAIU. Só o admin publica (rota do servidor).
--   - IDEIAS (forum_ideas): qualquer pessoa logada sugere; todos votam PARA CIMA (quero) ou PARA BAIXO (não quero), um voto por pessoa;
--     o admin dá a situação (em análise, planejada, fazendo, feita, não vai entrar) e, quando sai numa versão, liga a ideia à novidade.
--   - COMENTÁRIOS (forum_comments) nas ideias e nas novidades.
-- Leitura pública (visitante lê); escrita só logado e só o que é seu; votos e contadores mantidos pelo banco. Limites: 5 ideias/dia, 60 comentários/hora.
-- O admin esconde ideia/comentário (hidden) — some para todos menos o autor. Rollback: supabase/rollbacks/forum_rollback.sql.
-- Cenários: supabase/tests/forum_scenarios.sql.

CREATE TABLE IF NOT EXISTS public.forum_releases (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version      text NOT NULL CHECK (length(btrim(version)) BETWEEN 1 AND 30),
    title        text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 120),
    summary      text CHECK (summary IS NULL OR length(summary) <= 600),
    added        text[] NOT NULL DEFAULT '{}',     -- o que ENTROU
    improved     text[] NOT NULL DEFAULT '{}',     -- o que MELHOROU
    removed      text[] NOT NULL DEFAULT '{}',     -- o que SAIU
    released_at  timestamptz NOT NULL DEFAULT now(),
    comment_count int NOT NULL DEFAULT 0,
    created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.forum_ideas (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title         text NOT NULL CHECK (length(btrim(title)) BETWEEN 5 AND 100),
    body          text CHECK (body IS NULL OR length(body) <= 1000),
    category      text NOT NULL DEFAULT 'geral' CHECK (category IN ('geral', 'compras', 'lojas', 'motoristas', 'servicos', 'social', 'digital', 'pagamentos', 'outro')),
    status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'review', 'planned', 'doing', 'done', 'declined')),
    status_note   text CHECK (status_note IS NULL OR length(status_note) <= 300),
    release_id    uuid REFERENCES public.forum_releases(id) ON DELETE SET NULL,
    up_count      int NOT NULL DEFAULT 0,
    down_count    int NOT NULL DEFAULT 0,
    comment_count int NOT NULL DEFAULT 0,
    hidden        boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forum_ideas_rank_idx ON public.forum_ideas ((up_count - down_count) DESC, created_at DESC) WHERE NOT hidden;

CREATE TABLE IF NOT EXISTS public.forum_votes (
    idea_id    uuid NOT NULL REFERENCES public.forum_ideas(id) ON DELETE CASCADE,
    voter_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    value      smallint NOT NULL CHECK (value IN (-1, 1)),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (idea_id, voter_id)
);

CREATE TABLE IF NOT EXISTS public.forum_comments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    idea_id    uuid REFERENCES public.forum_ideas(id) ON DELETE CASCADE,
    release_id uuid REFERENCES public.forum_releases(id) ON DELETE CASCADE,
    author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    body       text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 600),
    is_team    boolean NOT NULL DEFAULT false,      -- resposta oficial do iUser (só o servidor marca)
    hidden     boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((idea_id IS NULL) <> (release_id IS NULL))
);
CREATE INDEX IF NOT EXISTS forum_comments_idea_idx ON public.forum_comments (idea_id, created_at);
CREATE INDEX IF NOT EXISTS forum_comments_release_idx ON public.forum_comments (release_id, created_at);

ALTER TABLE public.forum_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.forum_releases, public.forum_ideas, public.forum_votes, public.forum_comments FROM anon, authenticated;

-- leitura pública (o escondido só o autor vê)
GRANT SELECT ON public.forum_releases, public.forum_ideas, public.forum_comments TO anon, authenticated;
DROP POLICY IF EXISTS forum_releases_read ON public.forum_releases;
CREATE POLICY forum_releases_read ON public.forum_releases FOR SELECT USING (true);
DROP POLICY IF EXISTS forum_ideas_read ON public.forum_ideas;
CREATE POLICY forum_ideas_read ON public.forum_ideas FOR SELECT USING (NOT hidden OR author_id = auth.uid());
DROP POLICY IF EXISTS forum_comments_read ON public.forum_comments;
CREATE POLICY forum_comments_read ON public.forum_comments FOR SELECT USING (NOT hidden OR author_id = auth.uid());
-- o próprio voto (para a tela marcar a setinha)
GRANT SELECT ON public.forum_votes TO authenticated;
DROP POLICY IF EXISTS forum_votes_read_own ON public.forum_votes;
CREATE POLICY forum_votes_read_own ON public.forum_votes FOR SELECT TO authenticated USING (voter_id = auth.uid());

-- ── escrever: só por função (confere quem é, limites e contadores) ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.forum_create_idea(p_title text, p_body text, p_category text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para sugerir' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND COALESCE(is_blocked, false)) THEN RAISE EXCEPTION 'Conta bloqueada' USING ERRCODE = '42501'; END IF;
    IF length(btrim(COALESCE(p_title, ''))) < 5 THEN RAISE EXCEPTION 'Escreva a ideia em pelo menos 5 letras' USING ERRCODE = '22023'; END IF;
    IF (SELECT count(*) FROM public.forum_ideas WHERE author_id = v_uid AND created_at > now() - interval '24 hours') >= 5 THEN
        RAISE EXCEPTION 'Você já sugeriu 5 ideias hoje. Volte amanhã!' USING ERRCODE = '22023', HINT = 'forum_limit';
    END IF;
    INSERT INTO public.forum_ideas (author_id, title, body, category)
    VALUES (v_uid, left(btrim(p_title), 100), NULLIF(left(btrim(COALESCE(p_body, '')), 1000), ''),
            CASE WHEN p_category IN ('geral', 'compras', 'lojas', 'motoristas', 'servicos', 'social', 'digital', 'pagamentos', 'outro') THEN p_category ELSE 'geral' END)
    RETURNING id INTO v_id;
    -- quem sugere já vota na própria ideia
    INSERT INTO public.forum_votes (idea_id, voter_id, value) VALUES (v_id, v_uid, 1);
    UPDATE public.forum_ideas SET up_count = 1 WHERE id = v_id;
    RETURN v_id;
END; $$;

-- p_value: 1 = quero, -1 = não quero, 0 = tirar o voto. Devolve os contadores novos.
CREATE OR REPLACE FUNCTION public.forum_vote(p_idea uuid, p_value int) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); i public.forum_ideas;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para votar' USING ERRCODE = '42501'; END IF;
    IF p_value NOT IN (-1, 0, 1) THEN RAISE EXCEPTION 'Voto inválido' USING ERRCODE = '22023'; END IF;
    SELECT * INTO i FROM public.forum_ideas WHERE id = p_idea AND NOT hidden FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ideia não encontrada' USING ERRCODE = '22023'; END IF;
    IF p_value = 0 THEN
        DELETE FROM public.forum_votes WHERE idea_id = p_idea AND voter_id = v_uid;
    ELSE
        INSERT INTO public.forum_votes (idea_id, voter_id, value) VALUES (p_idea, v_uid, p_value)
        ON CONFLICT (idea_id, voter_id) DO UPDATE SET value = EXCLUDED.value, created_at = now();
    END IF;
    UPDATE public.forum_ideas SET
        up_count = (SELECT count(*) FROM public.forum_votes WHERE idea_id = p_idea AND value = 1),
        down_count = (SELECT count(*) FROM public.forum_votes WHERE idea_id = p_idea AND value = -1)
     WHERE id = p_idea RETURNING * INTO i;
    RETURN jsonb_build_object('up', i.up_count, 'down', i.down_count, 'mine', p_value);
END; $$;

CREATE OR REPLACE FUNCTION public.forum_comment(p_idea uuid, p_release uuid, p_body text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para comentar' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND COALESCE(is_blocked, false)) THEN RAISE EXCEPTION 'Conta bloqueada' USING ERRCODE = '42501'; END IF;
    IF (p_idea IS NULL) = (p_release IS NULL) THEN RAISE EXCEPTION 'Comente numa ideia ou numa novidade' USING ERRCODE = '22023'; END IF;
    IF length(btrim(COALESCE(p_body, ''))) = 0 THEN RAISE EXCEPTION 'Escreva o comentário' USING ERRCODE = '22023'; END IF;
    IF p_idea IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.forum_ideas WHERE id = p_idea AND NOT hidden) THEN RAISE EXCEPTION 'Ideia não encontrada' USING ERRCODE = '22023'; END IF;
    IF p_release IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE id = p_release) THEN RAISE EXCEPTION 'Novidade não encontrada' USING ERRCODE = '22023'; END IF;
    IF (SELECT count(*) FROM public.forum_comments WHERE author_id = v_uid AND created_at > now() - interval '1 hour') >= 60 THEN
        RAISE EXCEPTION 'Muitos comentários seguidos. Espere um pouco.' USING ERRCODE = '22023', HINT = 'forum_limit';
    END IF;
    INSERT INTO public.forum_comments (idea_id, release_id, author_id, body) VALUES (p_idea, p_release, v_uid, left(btrim(p_body), 600)) RETURNING id INTO v_id;
    IF p_idea IS NOT NULL THEN UPDATE public.forum_ideas SET comment_count = comment_count + 1, updated_at = now() WHERE id = p_idea;
    ELSE UPDATE public.forum_releases SET comment_count = comment_count + 1 WHERE id = p_release; END IF;
    RETURN v_id;
END; $$;

-- o autor apaga o próprio comentário
CREATE OR REPLACE FUNCTION public.forum_delete_comment(p_comment uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.forum_comments;
BEGIN
    DELETE FROM public.forum_comments WHERE id = p_comment AND author_id = auth.uid() RETURNING * INTO c;
    IF NOT FOUND THEN RETURN; END IF;
    IF c.idea_id IS NOT NULL THEN UPDATE public.forum_ideas SET comment_count = GREATEST(0, comment_count - 1) WHERE id = c.idea_id;
    ELSE UPDATE public.forum_releases SET comment_count = GREATEST(0, comment_count - 1) WHERE id = c.release_id; END IF;
END; $$;

REVOKE ALL ON FUNCTION public.forum_create_idea(text, text, text), public.forum_vote(uuid, int), public.forum_comment(uuid, uuid, text),
    public.forum_delete_comment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.forum_create_idea(text, text, text), public.forum_vote(uuid, int), public.forum_comment(uuid, uuid, text),
    public.forum_delete_comment(uuid) TO authenticated;

-- ── ADMIN (só o serviço; a rota confere o admin geral e manda o id dele) ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_forum_release(p_id uuid, p_version text, p_title text, p_summary text, p_added text[], p_improved text[], p_removed text[], p_admin uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
    IF p_id IS NULL THEN
        INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, created_by)
        VALUES (btrim(p_version), btrim(p_title), NULLIF(btrim(COALESCE(p_summary, '')), ''), COALESCE(p_added, '{}'), COALESCE(p_improved, '{}'), COALESCE(p_removed, '{}'), p_admin)
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.forum_releases SET version = btrim(p_version), title = btrim(p_title), summary = NULLIF(btrim(COALESCE(p_summary, '')), ''),
               added = COALESCE(p_added, '{}'), improved = COALESCE(p_improved, '{}'), removed = COALESCE(p_removed, '{}')
         WHERE id = p_id RETURNING id INTO v_id;
    END IF;
    INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by)
    VALUES ('forum', 'release', NULL, jsonb_build_object('id', v_id, 'version', p_version, 'title', p_title), p_admin);
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_forum_idea(p_idea uuid, p_status text, p_note text, p_release uuid, p_hidden boolean, p_admin uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_status NOT IN ('open', 'review', 'planned', 'doing', 'done', 'declined') THEN RAISE EXCEPTION 'Situação inválida' USING ERRCODE = '22023'; END IF;
    UPDATE public.forum_ideas SET status = p_status, status_note = NULLIF(left(btrim(COALESCE(p_note, '')), 300), ''),
           release_id = p_release, hidden = COALESCE(p_hidden, false), updated_at = now()
     WHERE id = p_idea;
    INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by)
    VALUES ('forum', 'idea', NULL, jsonb_build_object('idea', p_idea, 'status', p_status, 'hidden', p_hidden), p_admin);
END; $$;

-- resposta oficial do iUser numa ideia/novidade (sai com o selo "Equipe iUser")
CREATE OR REPLACE FUNCTION public.admin_forum_team_comment(p_idea uuid, p_release uuid, p_body text, p_admin uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
    INSERT INTO public.forum_comments (idea_id, release_id, author_id, body, is_team) VALUES (p_idea, p_release, p_admin, left(btrim(p_body), 600), true) RETURNING id INTO v_id;
    IF p_idea IS NOT NULL THEN UPDATE public.forum_ideas SET comment_count = comment_count + 1, updated_at = now() WHERE id = p_idea;
    ELSE UPDATE public.forum_releases SET comment_count = comment_count + 1 WHERE id = p_release; END IF;
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_forum_hide_comment(p_comment uuid, p_hidden boolean, p_admin uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.forum_comments SET hidden = p_hidden WHERE id = p_comment;
    INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by)
    VALUES ('forum', 'hide_comment', NULL, jsonb_build_object('comment', p_comment, 'hidden', p_hidden), p_admin);
END; $$;

REVOKE ALL ON FUNCTION public.admin_forum_release(uuid, text, text, text, text[], text[], text[], uuid), public.admin_forum_idea(uuid, text, text, uuid, boolean, uuid),
    public.admin_forum_team_comment(uuid, uuid, text, uuid), public.admin_forum_hide_comment(uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_forum_release(uuid, text, text, text, text[], text[], text[], uuid), public.admin_forum_idea(uuid, text, text, uuid, boolean, uuid),
    public.admin_forum_team_comment(uuid, uuid, text, uuid), public.admin_forum_hide_comment(uuid, boolean, uuid) TO service_role;

-- primeira novidade: o lançamento do fórum (o admin escreve as próximas em Admin → Fórum)
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed)
SELECT '3.0', 'O iUser 3.0 e o fórum',
       'A versão 3.0 é a única do iUser desde novembro de 2026. E agora você pode acompanhar cada atualização e sugerir o que quer ver no app.',
       ARRAY['Fórum do iUser: novidades de cada versão e ideias de quem usa, com votos',
             'Cartões de desconto do iUser e QR do cardápio na mesa das lojas',
             'Pagamento do pedido direto à loja por Pix e rastreio do entregador'],
       ARRAY['Pedidos e entregas: o entregador aceita antes de a loja receber o pedido',
             'Termos de Uso e Política de Privacidade reescritos'],
       ARRAY['A versão 2.0 do app (só existe a 3.0)']
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases);
