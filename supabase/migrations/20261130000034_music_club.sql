-- CLUBE DA LOJA PAGO + MÚSICA (o fã assina o ARTISTA, não o iUser). Usa o Club VIP que a loja já tem (store_vip_members) e finalmente o torna PAGO:
--   · a loja define a MENSALIDADE (R$ 3 a R$ 500) e se o clube INCLUI ouvir todas as músicas dela (`store_club_settings.includes_music`);
--   · o fã paga por Pix DIRETO para a chave da loja e toca "Já fiz o Pix"; a loja confere na conta e confirma "Recebi" (o iUser NÃO movimenta o dinheiro, como na gorjeta e na entrada do
--     agendamento). Cada pagamento confirmado vale 30 DIAS a partir do fim do período atual (renovar antes de vencer não perde dia). Sem renovação automática: a assinatura automática
--     (cartão/Pix automático com split) é a etapa da cobrança automática;
--   · membro com período vigente abre as MÚSICAS da loja (produto digital só de áudio, sem prévia): `_digital_access` passa a reconhecer o clube, então a sala, o player, o download e a
--     biblioteca funcionam sem mudar nada. Curso (vídeo), e-book e programa NÃO entram no clube de música; o que a pessoa já comprou continua dela;
--   · clube que muda de grátis para pago: quem entrou de graça (source 'free') mantém as campanhas, mas NÃO ganha música; só o período pago libera;
--   · taxa do iUser: Pré-pago R$ 0; PÓS-PAGO R$ 0,50 por pagamento de clube CONFIRMADO (service_pricing 'club_payment_fee', editável em Admin → Planos), como nos outros serviços.
-- Tabelas sem acesso do app (tudo por função). Rollback: supabase/rollbacks/music_club_rollback.sql

ALTER TABLE public.store_vip_members DROP CONSTRAINT IF EXISTS store_vip_members_source_check;
ALTER TABLE public.store_vip_members ADD CONSTRAINT store_vip_members_source_check CHECK (source IN ('free', 'asaas', 'pix'));

CREATE TABLE IF NOT EXISTS public.store_club_settings (
    store_id       uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    includes_music boolean NOT NULL DEFAULT false
);
ALTER TABLE public.store_club_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_club_settings FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.store_club_payments (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id     uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    payer_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 300 AND 50000),
    status       text NOT NULL DEFAULT 'awaiting' CHECK (status IN ('awaiting', 'reported', 'confirmed', 'refused')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    reported_at  timestamptz,
    resolved_at  timestamptz,
    period_end   timestamptz          -- até quando este pagamento deixou o clube valendo (só depois de confirmado)
);
CREATE INDEX IF NOT EXISTS store_club_payments_store_idx ON public.store_club_payments (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS store_club_payments_payer_idx ON public.store_club_payments (payer_id, created_at DESC);
ALTER TABLE public.store_club_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_club_payments FROM anon, authenticated;

-- ---------------------------------------------------------------- taxa do pós-pago
ALTER TABLE public.driver_postpaid_charges ADD COLUMN IF NOT EXISTS club_payment_id uuid REFERENCES public.store_club_payments(id) ON DELETE SET NULL;
ALTER TABLE public.driver_postpaid_charges DROP CONSTRAINT IF EXISTS driver_postpaid_charges_type_check;
ALTER TABLE public.driver_postpaid_charges ADD CONSTRAINT driver_postpaid_charges_type_check
    CHECK (type IN ('ride_fee', 'service_fee', 'order_fee', 'in_person_fee', 'product_fee', 'publication_fee', 'service_listing_fee',
                    'schedule_activation_fee', 'appointment_fee', 'whatsapp_bot_message_fee', 'rental_listing_fee', 'club_payment_fee', 'payment'));
CREATE UNIQUE INDEX IF NOT EXISTS driver_postpaid_club_payment_dedupe_idx ON public.driver_postpaid_charges (club_payment_id) WHERE type = 'club_payment_fee';
ALTER TABLE public.service_pricing DROP CONSTRAINT IF EXISTS service_pricing_service_type_check;
ALTER TABLE public.service_pricing ADD CONSTRAINT service_pricing_service_type_check
    CHECK (service_type IN ('ride_fee', 'service_fee', 'order_fee', 'in_person_fee', 'product_fee', 'publication_fee', 'service_listing_fee',
                            'schedule_activation_fee', 'appointment_fee', 'whatsapp_bot_message_fee', 'whatsapp_bot_message_fee_postpaid', 'rental_listing_fee', 'club_payment_fee'));
INSERT INTO public.service_pricing (service_type, label, base_price, postpaid_price)
VALUES ('club_payment_fee', 'Pagamento de clube da loja confirmado', 0.50, 0.50) ON CONFLICT (service_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.accrue_postpaid_club_fee() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
    IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
        IF v_owner IS NOT NULL AND public.is_postpaid_user(v_owner) THEN
            INSERT INTO public.driver_postpaid_charges (driver_id, club_payment_id, store_id, type, amount)
            VALUES (v_owner, NEW.id, NEW.store_id, 'club_payment_fee', COALESCE((SELECT postpaid_price FROM public.service_pricing WHERE service_type = 'club_payment_fee'), 0.50))
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.accrue_postpaid_club_fee() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS store_club_payments_fee ON public.store_club_payments;
CREATE TRIGGER store_club_payments_fee AFTER UPDATE OF status ON public.store_club_payments FOR EACH ROW EXECUTE FUNCTION public.accrue_postpaid_club_fee();

-- ---------------------------------------------------------------- acesso: o clube abre as músicas da loja
CREATE OR REPLACE FUNCTION public._club_music_access(p_product uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_uid IS NOT NULL AND EXISTS (
        SELECT 1
          FROM public.products p
          JOIN public.stores s ON s.id = p.store_id
          JOIN public.store_club_settings cs ON cs.store_id = s.id AND cs.includes_music
          JOIN public.store_vip_members m ON m.store_id = s.id AND m.profile_id = p_uid AND m.status = 'active'
         WHERE p.id = p_product AND p.type = 'digital' AND COALESCE(p.is_active, false) AND s.vip_club_enabled AND COALESCE(s.is_active, true)
           AND ((s.vip_club_price IS NULL AND m.source = 'free') OR (m.source IN ('pix', 'asaas') AND m.current_period_end > now()))
           AND EXISTS (SELECT 1 FROM public.digital_contents c WHERE c.product_id = p.id AND NOT c.is_teaser AND c.kind = 'audio')
           AND NOT EXISTS (SELECT 1 FROM public.digital_contents c WHERE c.product_id = p.id AND NOT c.is_teaser AND c.kind <> 'audio'));
$$;
REVOKE ALL ON FUNCTION public._club_music_access(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._digital_access(p_product uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_uid IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product AND p.owner_id = p_uid)
        OR EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
                    WHERE oi.product_id = p_product AND o.buyer_id = p_uid AND o.status = 'paid')
        OR EXISTS (SELECT 1 FROM public.digital_claims dc WHERE dc.product_id = p_product AND dc.profile_id = p_uid)
        OR public._club_music_access(p_product, p_uid));
$$;
REVOKE ALL ON FUNCTION public._digital_access(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- a biblioteca lista também as músicas liberadas pelo clube (data = quando a pessoa entrou no clube)
CREATE OR REPLACE FUNCTION public.get_my_digital_library()
RETURNS TABLE (product_id uuid, product_name text, product_slug text, store_slug text, store_name text, image_url text, purchased_at timestamptz, items_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p.id, p.name, p.slug, s."storeSlug", s.name, p.image_url, max(x.at),
           (SELECT count(*) FROM public.digital_contents c WHERE c.product_id = p.id AND NOT c.is_teaser)
      FROM (
            SELECT oi.product_id, o.created_at AS at
              FROM public.order_items oi
              JOIN public.orders o ON o.id = oi.order_id AND o.buyer_id = auth.uid() AND o.status = 'paid'
            UNION ALL
            SELECT dc.product_id, dc.created_at FROM public.digital_claims dc WHERE dc.profile_id = auth.uid()
            UNION ALL
            SELECT p2.id, m.joined_at
              FROM public.store_vip_members m
              JOIN public.products p2 ON p2.store_id = m.store_id AND p2.type = 'digital'
             WHERE m.profile_id = auth.uid() AND public._club_music_access(p2.id, auth.uid())
           ) x
      JOIN public.products p ON p.id = x.product_id AND p.type = 'digital'
      LEFT JOIN public.stores s ON s.id = p.store_id
     WHERE auth.uid() IS NOT NULL
     GROUP BY p.id, p.name, p.slug, s."storeSlug", s.name, p.image_url
     ORDER BY max(x.at) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_digital_library() TO authenticated;

-- entrar de graça num clube PAGO não vale: a mensagem agora aponta o caminho certo
CREATE OR REPLACE FUNCTION public.join_vip_club(p_store_id uuid)
RETURNS public.store_vip_members LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store public.stores; v_member public.store_vip_members;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id;
    IF NOT FOUND OR NOT v_store.vip_club_enabled THEN RAISE EXCEPTION 'Essa loja não tem clube VIP ativo'; END IF;
    IF v_store.vip_club_price IS NOT NULL THEN RAISE EXCEPTION 'Este clube é pago: assine pela mensalidade.' USING HINT = 'paid_club'; END IF;
    INSERT INTO public.store_vip_members (store_id, profile_id, status, source) VALUES (p_store_id, auth.uid(), 'active', 'free')
    ON CONFLICT (store_id, profile_id) DO UPDATE SET status = 'active' RETURNING * INTO v_member;
    RETURN v_member;
END $$;
REVOKE ALL ON FUNCTION public.join_vip_club(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_vip_club(uuid) TO authenticated;

-- ---------------------------------------------------------------- o que cada um vê e faz
-- público: o clube desta loja (para o cartão do clube e o botão "Ouça com o clube") + a situação de quem está olhando
CREATE OR REPLACE FUNCTION public.get_club_info(p_store uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.stores; v_music boolean; m public.store_vip_members; v_uid uuid := auth.uid(); v_open_id uuid; v_open_status text; v_tracks integer;
BEGIN
    SELECT * INTO s FROM public.stores WHERE id = p_store;
    IF NOT FOUND OR NOT COALESCE(s.is_active, false) OR NOT COALESCE(s.vip_club_enabled, false) THEN RETURN jsonb_build_object('enabled', false); END IF;
    v_music := COALESCE((SELECT includes_music FROM public.store_club_settings WHERE store_id = p_store), false);
    SELECT count(*) INTO v_tracks FROM public.digital_contents c JOIN public.products p ON p.id = c.product_id
     WHERE p.store_id = p_store AND p.type = 'digital' AND COALESCE(p.is_active, false) AND c.kind = 'audio' AND NOT c.is_teaser;
    IF v_uid IS NOT NULL THEN SELECT * INTO m FROM public.store_vip_members WHERE store_id = p_store AND profile_id = v_uid; END IF;
    IF v_uid IS NOT NULL THEN
        SELECT id, status INTO v_open_id, v_open_status FROM public.store_club_payments WHERE store_id = p_store AND payer_id = v_uid AND status IN ('awaiting', 'reported') AND created_at > now() - interval '24 hours' ORDER BY created_at DESC LIMIT 1;
    END IF;
    RETURN jsonb_build_object(
        'enabled', true, 'is_owner', s.owner_id = v_uid,
        'price_cents', CASE WHEN s.vip_club_price IS NULL THEN NULL ELSE round(s.vip_club_price * 100)::int END,
        'can_charge', NULLIF(btrim(s.pix_key), '') IS NOT NULL,
        'includes_music', v_music, 'tracks', v_tracks, 'description', s.vip_club_description,
        'my', CASE WHEN v_uid IS NULL THEN NULL ELSE jsonb_build_object(
            'member', m.id IS NOT NULL AND m.status = 'active',
            'paid', m.source IN ('pix', 'asaas'),
            'period_end', m.current_period_end,
            'active', m.id IS NOT NULL AND m.status = 'active' AND (m.source = 'free' OR m.current_period_end > now()),
            'music_ok', v_music AND m.id IS NOT NULL AND m.status = 'active' AND ((s.vip_club_price IS NULL AND m.source = 'free') OR (m.source IN ('pix', 'asaas') AND m.current_period_end > now())),
            'open_payment', v_open_id, 'open_status', v_open_status) END);
END $$;
GRANT EXECUTE ON FUNCTION public.get_club_info(uuid) TO anon, authenticated;

-- o dono ajusta a mensalidade e se o clube inclui as músicas (preço NULL = clube grátis)
CREATE OR REPLACE FUNCTION public.set_club_settings(p_store uuid, p_price_cents integer, p_includes_music boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.stores;
BEGIN
    SELECT * INTO s FROM public.stores WHERE id = p_store AND owner_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Só a dona da loja ajusta o clube' USING ERRCODE = '42501'; END IF;
    IF p_price_cents IS NOT NULL THEN
        IF p_price_cents < 300 OR p_price_cents > 50000 THEN RAISE EXCEPTION 'A mensalidade fica entre R$ 3 e R$ 500.' USING ERRCODE = '22023', HINT = 'price'; END IF;
        IF NULLIF(btrim(s.pix_key), '') IS NULL THEN RAISE EXCEPTION 'Cadastre a chave Pix da loja para cobrar mensalidade.' USING ERRCODE = '22023', HINT = 'pix_required'; END IF;
    END IF;
    UPDATE public.stores SET vip_club_price = CASE WHEN p_price_cents IS NULL THEN NULL ELSE p_price_cents / 100.0 END WHERE id = p_store;
    INSERT INTO public.store_club_settings (store_id, includes_music) VALUES (p_store, COALESCE(p_includes_music, false))
    ON CONFLICT (store_id) DO UPDATE SET includes_music = EXCLUDED.includes_music;
END $$;
REVOKE ALL ON FUNCTION public.set_club_settings(uuid, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_club_settings(uuid, integer, boolean) TO authenticated;

-- o fã começa a assinar/renovar: devolve a chave Pix (privada) e o valor; reaproveita o pagamento aberto
CREATE OR REPLACE FUNCTION public.start_club_payment(p_store uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); s public.stores; v_cents integer; v_id uuid;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta para assinar o clube' USING ERRCODE = '42501'; END IF;
    SELECT * INTO s FROM public.stores WHERE id = p_store;
    IF NOT FOUND OR NOT COALESCE(s.is_active, false) OR NOT COALESCE(s.vip_club_enabled, false) OR s.vip_club_price IS NULL THEN RAISE EXCEPTION 'Esta loja não tem clube pago' USING ERRCODE = '22023', HINT = 'no_paid_club'; END IF;
    IF s.owner_id = v_uid THEN RAISE EXCEPTION 'Você não pode assinar o clube da sua própria loja' USING ERRCODE = '22023', HINT = 'own_store'; END IF;
    IF NULLIF(btrim(s.pix_key), '') IS NULL THEN RAISE EXCEPTION 'Esta loja ainda não recebe pagamentos pelo clube' USING ERRCODE = '22023', HINT = 'pix_required'; END IF;
    v_cents := round(s.vip_club_price * 100)::int;
    SELECT id INTO v_id FROM public.store_club_payments WHERE store_id = p_store AND payer_id = v_uid AND status IN ('awaiting', 'reported') AND created_at > now() - interval '24 hours' AND amount_cents = v_cents ORDER BY created_at DESC LIMIT 1;
    IF v_id IS NULL THEN
        IF (SELECT count(*) FROM public.store_club_payments WHERE payer_id = v_uid AND created_at > now() - interval '1 hour') >= 6 THEN RAISE EXCEPTION 'Muitas tentativas. Tente de novo daqui a pouco.' USING ERRCODE = '22023', HINT = 'rate_limit'; END IF;
        INSERT INTO public.store_club_payments (store_id, payer_id, amount_cents) VALUES (p_store, v_uid, v_cents) RETURNING id INTO v_id;
    END IF;
    RETURN jsonb_build_object('id', v_id, 'amount_cents', v_cents, 'store_name', s.name, 'pix_key', s.pix_key, 'pix_key_type', s.pix_key_type);
END $$;
REVOKE ALL ON FUNCTION public.start_club_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_club_payment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_club_payment_paid(p_payment uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.store_club_payments;
BEGIN
    SELECT * INTO c FROM public.store_club_payments WHERE id = p_payment AND payer_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pagamento não encontrado' USING ERRCODE = '42501'; END IF;
    IF c.status = 'awaiting' THEN UPDATE public.store_club_payments SET status = 'reported', reported_at = now() WHERE id = p_payment; END IF;
    RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.report_club_payment_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_club_payment_paid(uuid) TO authenticated;

-- a loja confere na conta e decide; confirmar = +30 dias (a partir do fim do período, se ainda vale) e a pessoa vira membro pago
CREATE OR REPLACE FUNCTION public.resolve_club_payment(p_payment uuid, p_confirm boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.store_club_payments; v_end timestamptz;
BEGIN
    SELECT * INTO c FROM public.store_club_payments WHERE id = p_payment FOR UPDATE;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = c.store_id AND s.owner_id = auth.uid()) THEN RAISE EXCEPTION 'Só a loja decide' USING ERRCODE = '42501'; END IF;
    IF c.status IN ('awaiting', 'reported') THEN
        IF p_confirm THEN
            SELECT GREATEST(now(), COALESCE((SELECT m.current_period_end FROM public.store_vip_members m WHERE m.store_id = c.store_id AND m.profile_id = c.payer_id AND m.source IN ('pix', 'asaas')), now())) + interval '30 days' INTO v_end;
            INSERT INTO public.store_vip_members (store_id, profile_id, status, source, current_period_end) VALUES (c.store_id, c.payer_id, 'active', 'pix', v_end)
            ON CONFLICT (store_id, profile_id) DO UPDATE SET status = 'active', source = 'pix', current_period_end = EXCLUDED.current_period_end;
            UPDATE public.store_club_payments SET status = 'confirmed', resolved_at = now(), period_end = v_end WHERE id = p_payment;
        ELSE
            UPDATE public.store_club_payments SET status = 'refused', resolved_at = now() WHERE id = p_payment;
        END IF;
    END IF;
    RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.resolve_club_payment(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_club_payment(uuid, boolean) TO authenticated;

-- painel da dona: configuração, números, o que falta conferir e quem está pagando (só a dona)
CREATE OR REPLACE FUNCTION public.get_club_panel(p_store uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.stores;
BEGIN
    SELECT * INTO s FROM public.stores WHERE id = p_store AND owner_id = auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'Só a loja vê' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object(
        'enabled', COALESCE(s.vip_club_enabled, false),
        'price_cents', CASE WHEN s.vip_club_price IS NULL THEN NULL ELSE round(s.vip_club_price * 100)::int END,
        'has_pix', NULLIF(btrim(s.pix_key), '') IS NOT NULL,
        'includes_music', COALESCE((SELECT includes_music FROM public.store_club_settings WHERE store_id = p_store), false),
        'tracks', (SELECT count(*) FROM public.digital_contents c JOIN public.products p ON p.id = c.product_id WHERE p.store_id = p_store AND p.type = 'digital' AND COALESCE(p.is_active, false) AND c.kind = 'audio' AND NOT c.is_teaser),
        'active_paid', (SELECT count(*) FROM public.store_vip_members m WHERE m.store_id = p_store AND m.status = 'active' AND m.source IN ('pix', 'asaas') AND m.current_period_end > now()),
        'free_members', (SELECT count(*) FROM public.store_vip_members m WHERE m.store_id = p_store AND m.status = 'active' AND m.source = 'free'),
        'to_check', (SELECT count(*) FROM public.store_club_payments WHERE store_id = p_store AND status = 'reported'),
        'confirmed_cents_30d', COALESCE((SELECT sum(amount_cents) FROM public.store_club_payments WHERE store_id = p_store AND status = 'confirmed' AND resolved_at > now() - interval '30 days'), 0),
        'confirmed_cents', COALESCE((SELECT sum(amount_cents) FROM public.store_club_payments WHERE store_id = p_store AND status = 'confirmed'), 0),
        'rows', COALESCE((SELECT jsonb_agg(r ORDER BY r.created_at DESC) FROM (
            SELECT c.id, c.amount_cents, c.created_at, c.period_end,
                   CASE WHEN c.status = 'awaiting' AND c.created_at < now() - interval '24 hours' THEN 'expired' ELSE c.status END AS status,
                   p.name AS payer_name, p."profileSlug" AS payer_slug
              FROM public.store_club_payments c JOIN public.profiles p ON p.id = c.payer_id
             WHERE c.store_id = p_store AND NOT (c.status = 'awaiting' AND c.created_at < now() - interval '24 hours')
             ORDER BY c.created_at DESC LIMIT 50) r), '[]'::jsonb),
        'members', COALESCE((SELECT jsonb_agg(r ORDER BY r.period_end) FROM (
            SELECT m.profile_id, m.current_period_end AS period_end, p.name, p."profileSlug" AS slug
              FROM public.store_vip_members m JOIN public.profiles p ON p.id = m.profile_id
             WHERE m.store_id = p_store AND m.status = 'active' AND m.source IN ('pix', 'asaas') AND m.current_period_end > now()
             ORDER BY m.current_period_end LIMIT 100) r), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.get_club_panel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_club_panel(uuid) TO authenticated;

-- campanhas e resgate de código: membro PAGO vencido não vê nem resgata (o grátis não vence). Edita a definição que está no banco, só se ainda não foi editada.
DO $$
DECLARE v_def text; v_fn text;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY['public.get_vip_campaigns(uuid)', 'public.redeem_campaign_code(uuid)'] LOOP
        v_def := pg_get_functiondef(v_fn::regprocedure);
        IF position('current_period_end' IN v_def) = 0 THEN
            v_def := replace(v_def, 'AND m.status = ''active''', 'AND m.status = ''active'' AND (m.source = ''free'' OR m.current_period_end > now())');
            EXECUTE v_def;
        END IF;
    END LOOP;
END $$;

-- /planos: o clube da loja entra nos benefícios (Pré-pago: taxa 0%; Pós-pago: R$ 0,50 por pagamento confirmado). Só acrescenta a linha, uma vez.
UPDATE public.plans SET features = array_append(COALESCE(features, ARRAY[]::text[]), 'Clube da loja com mensalidade e música dos artistas — taxa 0%')
 WHERE code IN ('loja', 'combo') AND NOT ('Clube da loja com mensalidade e música dos artistas — taxa 0%' = ANY (COALESCE(features, ARRAY[]::text[])));
UPDATE public.plans SET features = array_append(COALESCE(features, ARRAY[]::text[]), 'Clube da loja: R$ 0,50 por pagamento de mensalidade confirmado')
 WHERE code = 'pos_pago' AND NOT ('Clube da loja: R$ 0,50 por pagamento de mensalidade confirmado' = ANY (COALESCE(features, ARRAY[]::text[])));
