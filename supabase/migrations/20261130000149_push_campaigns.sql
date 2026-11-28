-- =====================================================================
-- AVISOS (campanhas de push) — 28/11/2026
--
-- Quem envia: o ADMINISTRADOR (todos, lojistas, pessoas escolhidas, seguidores/compradores de uma loja) e cada LOJA
-- (só para os seguidores e os compradores DELA, e só pessoas escolhidas dentro desse público).
-- · Dois interruptores por pessoa: "Novidades" (já existe) e "Ofertas e promoções" (promo_enabled, padrão DESLIGADO).
--   Campanha só vai para quem ligou Ofertas. Campanha nunca vai para bloqueado nem para quem não tem aparelho com aviso.
-- · Limite por loja (por dia e por campanha) em campaign_settings; cobrança de loja (pós-pago / pré-pago) fica preparada:
--   store_fee_cents = 0 por enquanto (ninguém é cobrado).
-- · Envio em lotes, marcando cada pessoa ANTES de enviar (campaign_claim), como o aviso de versão.
-- Rollback: supabase/rollbacks/push_campaigns_rollback.sql
-- =====================================================================

-- ---------------------------------------------------------------- Ofertas e promoções (interruptor separado)
ALTER TABLE public.update_notification_prefs ADD COLUMN IF NOT EXISTS promo_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_promo_notifications()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT coalesce((SELECT promo_enabled FROM public.update_notification_prefs WHERE profile_id = auth.uid()), false)
$$;
REVOKE ALL ON FUNCTION public.get_promo_notifications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_promo_notifications() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_promo_notifications(p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.update_notification_prefs (profile_id, enabled, promo_enabled, updated_at)
    VALUES (v_me, true, coalesce(p_enabled, false), now())
    ON CONFLICT (profile_id) DO UPDATE SET promo_enabled = EXCLUDED.promo_enabled, updated_at = now();
    RETURN coalesce(p_enabled, false);
END $$;
REVOKE ALL ON FUNCTION public.set_promo_notifications(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_promo_notifications(boolean) TO authenticated;

-- ---------------------------------------------------------------- limites (uma linha, sem acesso direto)
CREATE TABLE IF NOT EXISTS public.campaign_settings (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    store_per_day integer NOT NULL DEFAULT 1 CHECK (store_per_day BETWEEN 0 AND 20),
    store_max_recipients integer NOT NULL DEFAULT 500 CHECK (store_max_recipients BETWEEN 1 AND 5000),
    admin_max_recipients integer NOT NULL DEFAULT 20000 CHECK (admin_max_recipients BETWEEN 1 AND 200000),
    store_fee_cents integer NOT NULL DEFAULT 0 CHECK (store_fee_cents >= 0), -- cobrança por campanha da loja: 0 = ainda não cobra
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.campaign_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.campaign_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_settings FROM anon, authenticated;

-- ---------------------------------------------------------------- campanhas e fila
CREATE TABLE IF NOT EXISTS public.push_campaigns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE, -- null = campanha do administrador
    title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 80),
    body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 240),
    url text NOT NULL CHECK (url ~ '^/[^/]' AND char_length(url) <= 300), -- só caminho interno do iUser
    audience text NOT NULL CHECK (audience IN ('all','lojistas','people','store_followers','store_customers')),
    audience_ids uuid[] NOT NULL DEFAULT '{}',
    recipients integer NOT NULL DEFAULT 0,
    sent_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    CONSTRAINT push_campaigns_store_audience CHECK (store_id IS NOT NULL OR audience IN ('all','lojistas','people'))
);
CREATE INDEX IF NOT EXISTS push_campaigns_store_day_idx ON public.push_campaigns (store_id, created_at);
ALTER TABLE public.push_campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_campaigns FROM anon, authenticated;
GRANT SELECT (id, title, body, url, audience, recipients, sent_count, created_at, finished_at, store_id, created_by) ON public.push_campaigns TO authenticated;
DROP POLICY IF EXISTS "Quem criou vê a própria campanha" ON public.push_campaigns;
CREATE POLICY "Quem criou vê a própria campanha" ON public.push_campaigns FOR SELECT TO authenticated
    USING (created_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.push_campaign_queue (
    campaign_id uuid NOT NULL REFERENCES public.push_campaigns(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sent_at timestamptz,
    PRIMARY KEY (campaign_id, profile_id)
);
CREATE INDEX IF NOT EXISTS push_campaign_queue_pending_idx ON public.push_campaign_queue (campaign_id) WHERE sent_at IS NULL;
ALTER TABLE public.push_campaign_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_campaign_queue FROM anon, authenticated;

-- ---------------------------------------------------------------- quem recebe (só do servidor)
-- Público + filtros que valem para TODOS os tipos: aparelho com aviso, Ofertas ligado, conta não bloqueada.
CREATE OR REPLACE FUNCTION public._campaign_audience(p_audience text, p_store uuid, p_ids uuid[])
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH base AS (
        SELECT x.id FROM (
            SELECT p.id FROM public.profiles p WHERE p_audience = 'all'
            UNION ALL
            SELECT st.owner_id FROM public.stores st WHERE p_audience = 'lojistas' AND st.is_active AND st.owner_id IS NOT NULL
            UNION ALL
            SELECT u FROM unnest(p_ids) u WHERE p_audience = 'people'
            UNION ALL
            SELECT f.follower_id FROM public.follows f JOIN public.stores st ON st.owner_id = f.following_id
             WHERE p_audience = 'store_followers' AND st.id = p_store
            UNION ALL
            SELECT o.buyer_id FROM public.orders o
             WHERE p_audience = 'store_customers' AND o.store_id = p_store AND o.buyer_id IS NOT NULL AND o.status <> 'rejected'
        ) x(id)
    ),
    devices AS (
        SELECT user_id AS id FROM public.push_subscriptions
        UNION
        SELECT user_id FROM public.native_push_tokens WHERE platform = 'android'
    )
    SELECT DISTINCT b.id FROM base b
      JOIN devices d ON d.id = b.id
      JOIN public.profiles p ON p.id = b.id AND p.is_blocked IS NOT TRUE
      WHERE b.id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.update_notification_prefs x WHERE x.profile_id = b.id AND x.promo_enabled)
$$;
REVOKE ALL ON FUNCTION public._campaign_audience(text, uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- quantas pessoas receberiam (prévia antes de confirmar)
CREATE OR REPLACE FUNCTION public.campaign_preview(p_audience text, p_store uuid, p_ids uuid[] DEFAULT '{}')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_n integer;
BEGIN
    PERFORM public._campaign_check_sender(p_audience, p_store, p_ids);
    SELECT count(*) INTO v_n FROM public._campaign_audience(p_audience, p_store, coalesce(p_ids, '{}'));
    RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.campaign_preview(text, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campaign_preview(text, uuid, uuid[]) TO authenticated;

-- quem pode escolher o quê: o administrador (serviço) tudo; a loja só o próprio público
CREATE OR REPLACE FUNCTION public._campaign_check_sender(p_audience text, p_store uuid, p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
    IF auth.role() = 'service_role' THEN RETURN; END IF;           -- administrador (servidor)
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501'; END IF;
    IF p_store IS NULL OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = v_me) THEN
        RAISE EXCEPTION 'Só a dona da loja pode enviar por ela.' USING ERRCODE = '42501', HINT = 'campaign_not_owner';
    END IF;
    IF p_audience NOT IN ('store_followers','store_customers','people') THEN
        RAISE EXCEPTION 'A loja envia só para seguidores, compradores ou pessoas escolhidas.' USING ERRCODE = '22023', HINT = 'campaign_audience';
    END IF;
    IF p_audience = 'people' THEN
        -- só pessoas que seguem ou compraram da loja (não dá para mandar para estranhos)
        IF EXISTS (SELECT 1 FROM unnest(coalesce(p_ids, '{}')) i
                    WHERE NOT (EXISTS (SELECT 1 FROM public.follows f JOIN public.stores s ON s.owner_id = f.following_id
                                        WHERE s.id = p_store AND f.follower_id = i)
                               OR EXISTS (SELECT 1 FROM public.orders o WHERE o.store_id = p_store AND o.buyer_id = i))) THEN
            RAISE EXCEPTION 'Só dá para escolher quem segue ou comprou da loja.' USING ERRCODE = '42501', HINT = 'campaign_audience';
        END IF;
    END IF;
END $$;
REVOKE ALL ON FUNCTION public._campaign_check_sender(text, uuid, uuid[]) FROM PUBLIC, anon, authenticated;

-- cria a campanha e enfileira o público (limites conferidos aqui, no banco)
CREATE OR REPLACE FUNCTION public.campaign_create(p_title text, p_body text, p_url text, p_audience text, p_store uuid, p_ids uuid[] DEFAULT '{}', p_creator uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_me uuid := auth.uid(); v_id uuid; v_n integer; v_cfg public.campaign_settings%ROWTYPE; v_day integer;
    v_max integer;
BEGIN
    SELECT * INTO v_cfg FROM public.campaign_settings WHERE id = true;
    PERFORM public._campaign_check_sender(p_audience, p_store, coalesce(p_ids, '{}'));
    IF auth.role() = 'service_role' THEN
        v_max := v_cfg.admin_max_recipients;
        v_me := p_creator; -- o administrador (quem criou) vem da rota, já conferido pelo login
        IF v_me IS NULL THEN RAISE EXCEPTION 'Quem criou o aviso é obrigatório.' USING ERRCODE = '22023'; END IF;
        IF p_store IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store) THEN
            RAISE EXCEPTION 'Loja não encontrada.' USING ERRCODE = '22023';
        END IF;
    ELSE
        v_max := v_cfg.store_max_recipients;
        SELECT count(*) INTO v_day FROM public.push_campaigns WHERE store_id = p_store AND created_at > now() - interval '24 hours';
        IF v_day >= v_cfg.store_per_day THEN
            RAISE EXCEPTION 'Esta loja já enviou o limite de avisos de hoje.' USING ERRCODE = '22023', HINT = 'campaign_daily_limit';
        END IF;
    END IF;
    IF char_length(btrim(coalesce(p_title, ''))) NOT BETWEEN 2 AND 80 THEN
        RAISE EXCEPTION 'Título: de 2 a 80 letras.' USING ERRCODE = '22023', HINT = 'campaign_title';
    END IF;
    IF char_length(btrim(coalesce(p_body, ''))) NOT BETWEEN 1 AND 240 THEN
        RAISE EXCEPTION 'Texto: até 240 letras.' USING ERRCODE = '22023', HINT = 'campaign_body';
    END IF;
    IF coalesce(p_url, '') !~ '^/[^/]' OR char_length(p_url) > 300 THEN
        RAISE EXCEPTION 'O link tem que ser uma página do iUser (começa com /).' USING ERRCODE = '22023', HINT = 'campaign_url';
    END IF;

    SELECT count(*) INTO v_n FROM public._campaign_audience(p_audience, p_store, coalesce(p_ids, '{}'));
    IF v_n = 0 THEN
        RAISE EXCEPTION 'Ninguém vai receber esse aviso (ninguém ligou Ofertas ou não tem o aviso no aparelho).' USING ERRCODE = '22023', HINT = 'campaign_empty';
    END IF;
    IF v_n > v_max THEN
        RAISE EXCEPTION 'Esse público passa do limite de % pessoas por aviso.', v_max USING ERRCODE = '22023', HINT = 'campaign_too_big';
    END IF;

    INSERT INTO public.push_campaigns (created_by, store_id, title, body, url, audience, audience_ids, recipients)
    VALUES (v_me, p_store, btrim(p_title), btrim(p_body), p_url, p_audience, coalesce(p_ids, '{}'), v_n)
    RETURNING id INTO v_id;
    INSERT INTO public.push_campaign_queue (campaign_id, profile_id)
    SELECT v_id, x FROM public._campaign_audience(p_audience, p_store, coalesce(p_ids, '{}')) x;
    RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.campaign_create(text, text, text, text, uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campaign_create(text, text, text, text, uuid, uuid[], uuid) TO authenticated, service_role;

-- envio em lotes: marca antes de enviar e deixa de fora quem desligou Ofertas depois de entrar na fila
CREATE OR REPLACE FUNCTION public.campaign_claim(p_campaign uuid, p_limit integer)
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Só o serviço.' USING ERRCODE = '42501'; END IF;
    RETURN QUERY
    WITH next AS (
        SELECT q.profile_id FROM public.push_campaign_queue q
         WHERE q.campaign_id = p_campaign AND q.sent_at IS NULL
           AND EXISTS (SELECT 1 FROM public.update_notification_prefs x WHERE x.profile_id = q.profile_id AND x.promo_enabled)
         ORDER BY q.profile_id
         LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
         FOR UPDATE SKIP LOCKED
    )
    UPDATE public.push_campaign_queue q SET sent_at = now()
      FROM next WHERE q.campaign_id = p_campaign AND q.profile_id = next.profile_id
    RETURNING q.profile_id;
END $$;
REVOKE ALL ON FUNCTION public.campaign_claim(uuid, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.campaign_remaining(p_campaign uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT count(*)::integer FROM public.push_campaign_queue WHERE campaign_id = p_campaign AND sent_at IS NULL
$$;
REVOKE ALL ON FUNCTION public.campaign_remaining(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.campaign_mark_sent(p_campaign uuid, p_sent integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Só o serviço.' USING ERRCODE = '42501'; END IF;
    UPDATE public.push_campaigns SET sent_count = sent_count + greatest(0, coalesce(p_sent, 0)),
           finished_at = CASE WHEN NOT EXISTS (SELECT 1 FROM public.push_campaign_queue q WHERE q.campaign_id = p_campaign AND q.sent_at IS NULL)
                              THEN coalesce(finished_at, now()) ELSE finished_at END
     WHERE id = p_campaign;
END $$;
REVOKE ALL ON FUNCTION public.campaign_mark_sent(uuid, integer) FROM PUBLIC, anon, authenticated;

-- a loja (ou o administrador) vê as próprias campanhas
CREATE OR REPLACE FUNCTION public.get_my_campaigns(p_store uuid DEFAULT NULL)
RETURNS SETOF public.push_campaigns LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT c.* FROM public.push_campaigns c
     WHERE (p_store IS NOT NULL AND c.store_id = p_store AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store AND s.owner_id = auth.uid()))
        OR (p_store IS NULL AND c.store_id IS NULL AND c.created_by = auth.uid())
     ORDER BY c.created_at DESC LIMIT 30
$$;
REVOKE ALL ON FUNCTION public.get_my_campaigns(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_campaigns(uuid) TO authenticated;

-- tempo real: nada (o aviso é o push do aparelho)
