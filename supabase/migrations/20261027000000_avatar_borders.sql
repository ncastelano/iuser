-- Sistema de bordas de avatar: catálogo (administrado no Admin → Bordas), bordas que cada pessoa
-- possui, e a borda que ela está usando. A primeira é "Eu sou brasileiro" (verde, amarelo e azul):
-- quem entra no plano Pré-pago até 15/11/2026 ganha e já passa a usar. Bordas futuras são
-- resgatadas e escolhidas pela pessoa (não trocam sozinhas).

-- ===== Catálogo =====
CREATE TABLE IF NOT EXISTS public.avatar_borders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9_-]{2,40}$'),
    name TEXT NOT NULL,
    description TEXT,
    -- Cores do anel que gira, em ordem (hex). O anel fecha voltando à primeira cor.
    colors TEXT[] NOT NULL CHECK (array_length(colors, 1) BETWEEN 2 AND 12),
    -- Aparece pros usuários (desligada some do catálogo e do avatar de todo mundo)
    is_active BOOLEAN NOT NULL DEFAULT true,
    -- auto_prepaid: quem entra no Pré-pago dentro da janela ganha e já usa; claim: a pessoa resgata e escolhe;
    -- admin_only: só o admin concede.
    grant_mode TEXT NOT NULL DEFAULT 'claim' CHECK (grant_mode IN ('auto_prepaid', 'claim', 'admin_only')),
    available_from TIMESTAMPTZ,
    available_until TIMESTAMPTZ,
    requires_prepaid BOOLEAN NOT NULL DEFAULT false,
    -- Toda a hierarquia (do administrador pra baixo) ganha essa borda, com plano ou sem
    for_hierarchy BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_avatar_borders (
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    border_id UUID NOT NULL REFERENCES public.avatar_borders(id) ON DELETE CASCADE,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source TEXT NOT NULL DEFAULT 'claim',
    PRIMARY KEY (profile_id, border_id)
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_border_id UUID REFERENCES public.avatar_borders(id) ON DELETE SET NULL;

ALTER TABLE public.avatar_borders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos veem as bordas ativas" ON public.avatar_borders FOR SELECT USING (is_active);
ALTER TABLE public.user_avatar_borders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cada pessoa vê as próprias bordas" ON public.user_avatar_borders FOR SELECT USING (auth.uid() = profile_id);
-- Sem policy de escrita: tudo passa pelas funções abaixo ou pela rota do admin (service role).

-- A primeira borda
INSERT INTO public.avatar_borders (slug, name, description, colors, grant_mode, available_until, for_hierarchy, sort_order)
VALUES (
    'eu-sou-brasileiro',
    'Eu sou brasileiro',
    'E não desisto nunca - Pra quem entrou no plano Pré-pago até 15 de novembro.',
    ARRAY['#4ade80', '#86efac', '#fde047', '#38bdf8', '#3b82f6', '#22c55e'],
    'auto_prepaid',
    '2026-11-15 23:59:59-03',
    true,
    0
)
ON CONFLICT (slug) DO NOTHING;

-- ===== Quem tem borda aparecendo (qualquer pessoa vê, até visitante) =====
CREATE OR REPLACE FUNCTION public.get_avatar_borders_for(p_ids uuid[])
RETURNS TABLE(profile_id uuid, colors text[])
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT p.id, b.colors
    FROM public.profiles p
    JOIN public.avatar_borders b ON b.id = p.avatar_border_id AND b.is_active
    WHERE p.id = ANY (p_ids[1:200]);
$$;
REVOKE ALL ON FUNCTION public.get_avatar_borders_for(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_avatar_borders_for(uuid[]) TO anon, authenticated, service_role;

-- ===== Pré-pago ativo? =====
CREATE OR REPLACE FUNCTION public._has_active_prepaid(p_user uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.subscriptions s JOIN public.plans pl ON pl.id = s.plan_id
        WHERE s.user_id = p_user AND pl.code = 'pre_pago' AND s.status = 'active'
          AND (s.starts_at IS NULL OR s.starts_at <= now()) AND s.current_period_end > now()
    );
$$;
-- Uso interno (as funções SECURITY DEFINER abaixo): não fica exposta a quem chama a API.
REVOKE ALL ON FUNCTION public._has_active_prepaid(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._has_active_prepaid(uuid) TO service_role;

-- ===== Resgatar uma borda (a pessoa escolhe depois se usa) =====
CREATE OR REPLACE FUNCTION public.claim_avatar_border(p_slug text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_user uuid := auth.uid();
    v_b public.avatar_borders%ROWTYPE;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta pra resgatar'; END IF;
    SELECT * INTO v_b FROM public.avatar_borders WHERE slug = p_slug AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Essa borda não está disponível'; END IF;
    IF v_b.grant_mode = 'admin_only' THEN RAISE EXCEPTION 'Essa borda só o administrador concede'; END IF;
    IF v_b.available_from IS NOT NULL AND now() < v_b.available_from THEN RAISE EXCEPTION 'Essa borda ainda não abriu pra resgate'; END IF;
    IF v_b.available_until IS NOT NULL AND now() > v_b.available_until THEN RAISE EXCEPTION 'O prazo pra resgatar essa borda acabou'; END IF;
    IF v_b.requires_prepaid AND NOT public._has_active_prepaid(v_user) THEN RAISE EXCEPTION 'Essa borda é pra quem usa o plano Pré-pago'; END IF;
    INSERT INTO public.user_avatar_borders (profile_id, border_id, source) VALUES (v_user, v_b.id, 'claim') ON CONFLICT DO NOTHING;
    RETURN v_b.id;
END; $$;
REVOKE ALL ON FUNCTION public.claim_avatar_border(text) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_avatar_border(text) TO authenticated;

-- ===== Usar uma borda que a pessoa tem (null = tirar a borda) =====
CREATE OR REPLACE FUNCTION public.equip_avatar_border(p_border_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta'; END IF;
    IF p_border_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.user_avatar_borders WHERE profile_id = v_user AND border_id = p_border_id
    ) THEN
        RAISE EXCEPTION 'Você ainda não tem essa borda';
    END IF;
    UPDATE public.profiles SET avatar_border_id = p_border_id WHERE id = v_user;
END; $$;
REVOKE ALL ON FUNCTION public.equip_avatar_border(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.equip_avatar_border(uuid) TO authenticated;

-- ===== Concessão automática =====
-- Entrou (ou voltou) no Pré-pago dentro da janela: ganha as bordas auto_prepaid e já usa.
CREATE OR REPLACE FUNCTION public._grant_prepaid_borders(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; v_new int;
BEGIN
    FOR r IN
        SELECT id FROM public.avatar_borders
        WHERE is_active AND grant_mode = 'auto_prepaid'
          AND (available_from IS NULL OR now() >= available_from)
          AND (available_until IS NULL OR now() <= available_until)
        ORDER BY sort_order
    LOOP
        INSERT INTO public.user_avatar_borders (profile_id, border_id, source) VALUES (p_user, r.id, 'prepaid_auto')
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_new = ROW_COUNT;
        -- Só quando acabou de ganhar (renovar o plano não troca a borda que a pessoa escolheu)
        IF v_new > 0 THEN UPDATE public.profiles SET avatar_border_id = r.id WHERE id = p_user; END IF;
    END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_subscription_grant_borders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'active' AND EXISTS (SELECT 1 FROM public.plans pl WHERE pl.id = NEW.plan_id AND pl.code = 'pre_pago') THEN
        PERFORM public._grant_prepaid_borders(NEW.user_id);
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS subscriptions_grant_borders ON public.subscriptions;
CREATE TRIGGER subscriptions_grant_borders AFTER INSERT OR UPDATE OF status ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.trg_subscription_grant_borders();

-- Entrou na hierarquia (do administrador pra baixo): ganha as bordas for_hierarchy, com plano ou sem.
CREATE OR REPLACE FUNCTION public._grant_hierarchy_borders(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; v_new int;
BEGIN
    FOR r IN SELECT id FROM public.avatar_borders WHERE is_active AND for_hierarchy ORDER BY sort_order LOOP
        INSERT INTO public.user_avatar_borders (profile_id, border_id, source) VALUES (p_user, r.id, 'hierarchy') ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_new = ROW_COUNT;
        IF v_new > 0 THEN UPDATE public.profiles SET avatar_border_id = COALESCE(avatar_border_id, r.id) WHERE id = p_user; END IF;
    END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_profile_status_grant_borders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.status_id IS NOT NULL AND NEW.status_id IS DISTINCT FROM OLD.status_id
       AND EXISTS (SELECT 1 FROM public.user_statuses s WHERE s.id = NEW.status_id AND s.is_active) THEN
        PERFORM public._grant_hierarchy_borders(NEW.id);
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS profiles_status_grant_borders ON public.profiles;
CREATE TRIGGER profiles_status_grant_borders AFTER UPDATE OF status_id ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.trg_profile_status_grant_borders();

-- ===== Quem já está no Pré-pago ou na hierarquia hoje mantém a borda que já aparecia =====
DO $$
DECLARE r record; v_b uuid;
BEGIN
    SELECT id INTO v_b FROM public.avatar_borders WHERE slug = 'eu-sou-brasileiro';
    IF v_b IS NULL THEN RETURN; END IF;
    FOR r IN
        SELECT p.id FROM public.profiles p
        WHERE public._has_active_prepaid(p.id)
           OR EXISTS (SELECT 1 FROM public.user_statuses s WHERE s.id = p.status_id AND s.is_active)
           OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id AND u.email = 'ncastelano@gmail.com')
    LOOP
        INSERT INTO public.user_avatar_borders (profile_id, border_id, source) VALUES (r.id, v_b, 'backfill') ON CONFLICT DO NOTHING;
        UPDATE public.profiles SET avatar_border_id = COALESCE(avatar_border_id, v_b) WHERE id = r.id;
    END LOOP;
END $$;
