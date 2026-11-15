-- GORJETA / "APOIAR O ARTISTA": qualquer pessoa logada manda um valor a uma LOJA (o artista vende pela loja), por Pix direto para a chave da loja. O iUser NÃO movimenta esse dinheiro:
-- só registra o que cada um DECLARA, como na entrada do agendamento — a pessoa paga por fora e toca "Já fiz o Pix"; a loja confere na conta e confirma "Recebi" (ou "Não recebi").
--   · a chave Pix da loja continua PRIVADA (stores.pix_key): só sai de `create_store_tip`, para quem acabou de criar a gorjeta (com limite de uso);
--   · valor de R$ 1 a R$ 1.000 (em centavos), recado opcional de até 140 caracteres, ninguém dá gorjeta na própria loja;
--   · cada loja pode desligar (`store_tip_settings.enabled`, ligado por padrão) e só aceita quem tem chave Pix e está ativa;
--   · estados: awaiting (criada) → reported ("Já fiz o Pix") → confirmed | refused (a loja decide); awaiting com mais de 24 h aparece como "expired";
--   · nada de taxa do iUser por enquanto; sem aviso na ilha ainda (a loja vê a lista e o selo "a conferir" no painel).
-- Tabelas sem acesso do app (tudo por função). Rollback: supabase/rollbacks/store_tips_rollback.sql

CREATE TABLE IF NOT EXISTS public.store_tip_settings (
    store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    enabled  boolean NOT NULL DEFAULT true
);
ALTER TABLE public.store_tip_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_tip_settings FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.store_tips (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id     uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id   uuid REFERENCES public.products(id) ON DELETE SET NULL,
    tipper_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 100 AND 100000),
    message      text CHECK (message IS NULL OR char_length(message) <= 140),
    status       text NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting', 'reported', 'confirmed', 'refused')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    reported_at  timestamptz,
    resolved_at  timestamptz
);
CREATE INDEX IF NOT EXISTS store_tips_store_idx ON public.store_tips (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS store_tips_tipper_idx ON public.store_tips (tipper_id, created_at DESC);
ALTER TABLE public.store_tips ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_tips FROM anon, authenticated;

-- a loja aceita gorjeta? (público: o botão "Apoiar" só aparece se sim) + quantas pessoas já apoiaram
CREATE OR REPLACE FUNCTION public.get_store_tips_info(p_store uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'enabled', COALESCE(s.is_active, false) AND COALESCE(NULLIF(btrim(s.pix_key), '') IS NOT NULL, false) AND COALESCE(t.enabled, true),
        'is_owner', s.owner_id = auth.uid(),
        'supporters', (SELECT count(DISTINCT x.tipper_id) FROM public.store_tips x WHERE x.store_id = s.id AND x.status = 'confirmed'))
      FROM public.stores s LEFT JOIN public.store_tip_settings t ON t.store_id = s.id
     WHERE s.id = p_store;
$$;
GRANT EXECUTE ON FUNCTION public.get_store_tips_info(uuid) TO anon, authenticated;

-- criar a gorjeta: devolve a chave Pix para a pessoa pagar
CREATE OR REPLACE FUNCTION public.create_store_tip(p_store uuid, p_amount_cents integer, p_product uuid DEFAULT NULL, p_message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); s public.stores; v_id uuid; v_msg text := NULLIF(left(btrim(COALESCE(p_message, '')), 140), '');
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para apoiar' USING ERRCODE = '42501'; END IF;
    SELECT * INTO s FROM public.stores WHERE id = p_store;
    IF NOT FOUND OR NOT COALESCE(s.is_active, false) THEN RAISE EXCEPTION 'Loja não encontrada' USING ERRCODE = '22023'; END IF;
    IF s.owner_id = v_uid THEN RAISE EXCEPTION 'Você não pode apoiar a sua própria loja' USING ERRCODE = '22023', HINT = 'own_store'; END IF;
    IF NOT COALESCE((SELECT enabled FROM public.store_tip_settings WHERE store_id = p_store), true) OR NULLIF(btrim(s.pix_key), '') IS NULL THEN
        RAISE EXCEPTION 'Esta loja não está recebendo apoio agora' USING ERRCODE = '22023', HINT = 'tips_off';
    END IF;
    IF p_amount_cents IS NULL OR p_amount_cents < 100 OR p_amount_cents > 100000 THEN RAISE EXCEPTION 'Escolha um valor entre R$ 1 e R$ 1.000' USING ERRCODE = '22023', HINT = 'amount'; END IF;
    IF p_product IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product AND store_id = p_store) THEN p_product := NULL; END IF;
    IF (SELECT count(*) FROM public.store_tips WHERE tipper_id = v_uid AND created_at > now() - interval '1 hour') >= 10 THEN
        RAISE EXCEPTION 'Muitas tentativas. Tente de novo daqui a pouco.' USING ERRCODE = '22023', HINT = 'rate_limit';
    END IF;
    INSERT INTO public.store_tips (store_id, product_id, tipper_id, amount_cents, message) VALUES (p_store, p_product, v_uid, p_amount_cents, v_msg) RETURNING id INTO v_id;
    RETURN jsonb_build_object('id', v_id, 'amount_cents', p_amount_cents, 'store_name', s.name, 'pix_key', s.pix_key, 'pix_key_type', s.pix_key_type);
END $$;
REVOKE ALL ON FUNCTION public.create_store_tip(uuid, integer, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_store_tip(uuid, integer, uuid, text) TO authenticated;

-- "Já fiz o Pix" (quem apoia)
CREATE OR REPLACE FUNCTION public.report_store_tip_paid(p_tip uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.store_tips;
BEGIN
    SELECT * INTO t FROM public.store_tips WHERE id = p_tip AND tipper_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Apoio não encontrado' USING ERRCODE = '42501'; END IF;
    IF t.status = 'awaiting' THEN UPDATE public.store_tips SET status = 'reported', reported_at = now() WHERE id = p_tip; END IF;
    RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.report_store_tip_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_store_tip_paid(uuid) TO authenticated;

-- a loja confere na conta e decide
CREATE OR REPLACE FUNCTION public.resolve_store_tip(p_tip uuid, p_confirm boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.store_tips;
BEGIN
    SELECT * INTO t FROM public.store_tips WHERE id = p_tip FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = t.store_id AND s.owner_id = auth.uid()) THEN RAISE EXCEPTION 'Só a loja decide' USING ERRCODE = '42501'; END IF;
    IF t.status IN ('awaiting', 'reported') THEN
        UPDATE public.store_tips SET status = CASE WHEN p_confirm THEN 'confirmed' ELSE 'refused' END, resolved_at = now() WHERE id = p_tip;
    END IF;
    RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.resolve_store_tip(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_store_tip(uuid, boolean) TO authenticated;

-- o painel da loja: totais + as últimas 50 (só o dono)
CREATE OR REPLACE FUNCTION public.get_store_tips_panel(p_store uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store AND s.owner_id = auth.uid()) THEN RAISE EXCEPTION 'Só a loja vê' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object(
        'enabled', COALESCE((SELECT enabled FROM public.store_tip_settings WHERE store_id = p_store), true),
        'confirmed_cents', COALESCE((SELECT sum(amount_cents) FROM public.store_tips WHERE store_id = p_store AND status = 'confirmed'), 0),
        'confirmed_count', (SELECT count(*) FROM public.store_tips WHERE store_id = p_store AND status = 'confirmed'),
        'to_check', (SELECT count(*) FROM public.store_tips WHERE store_id = p_store AND status = 'reported'),
        'rows', COALESCE((SELECT jsonb_agg(r ORDER BY r.created_at DESC) FROM (
            SELECT t.id, t.amount_cents, t.message, t.created_at,
                   CASE WHEN t.status = 'awaiting' AND t.created_at < now() - interval '24 hours' THEN 'expired' ELSE t.status END AS status,
                   p.name AS tipper_name, p."profileSlug" AS tipper_slug, pr.name AS product_name
              FROM public.store_tips t JOIN public.profiles p ON p.id = t.tipper_id LEFT JOIN public.products pr ON pr.id = t.product_id
             WHERE t.store_id = p_store AND NOT (t.status = 'awaiting' AND t.created_at < now() - interval '24 hours')
             ORDER BY t.created_at DESC LIMIT 50) r), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.get_store_tips_panel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_tips_panel(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_store_tips_enabled(p_store uuid, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store AND s.owner_id = auth.uid()) THEN RAISE EXCEPTION 'Só a loja muda isso' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.store_tip_settings (store_id, enabled) VALUES (p_store, COALESCE(p_enabled, true)) ON CONFLICT (store_id) DO UPDATE SET enabled = EXCLUDED.enabled;
END $$;
REVOKE ALL ON FUNCTION public.set_store_tips_enabled(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_store_tips_enabled(uuid, boolean) TO authenticated;
