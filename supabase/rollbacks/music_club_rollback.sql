-- Desfaz 20261130000034_music_club.sql (clube da loja pago + música). ATENÇÃO: apaga os membros pagos por Pix, os pagamentos do clube e as taxas de pós-pago deste tipo.
DO $$
DECLARE v_def text; v_fn text;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY['public.get_vip_campaigns(uuid)', 'public.redeem_campaign_code(uuid)'] LOOP
        v_def := pg_get_functiondef(v_fn::regprocedure);
        v_def := replace(v_def, ' AND (m.source = ''free'' OR m.current_period_end > now())', '');
        EXECUTE v_def;
    END LOOP;
END $$;

UPDATE public.plans SET features = array_remove(features, 'Clube da loja com mensalidade e música dos artistas — taxa 0%') WHERE code IN ('loja', 'combo');
UPDATE public.plans SET features = array_remove(features, 'Clube da loja: R$ 0,50 por pagamento de mensalidade confirmado') WHERE code = 'pos_pago';
DROP TRIGGER IF EXISTS store_club_payments_fee ON public.store_club_payments;
DROP FUNCTION IF EXISTS public.accrue_postpaid_club_fee();
DELETE FROM public.driver_postpaid_charges WHERE type = 'club_payment_fee';
DROP INDEX IF EXISTS public.driver_postpaid_club_payment_dedupe_idx;
ALTER TABLE public.driver_postpaid_charges DROP COLUMN IF EXISTS club_payment_id;
ALTER TABLE public.driver_postpaid_charges DROP CONSTRAINT IF EXISTS driver_postpaid_charges_type_check;
ALTER TABLE public.driver_postpaid_charges ADD CONSTRAINT driver_postpaid_charges_type_check
    CHECK (type IN ('ride_fee', 'service_fee', 'order_fee', 'in_person_fee', 'product_fee', 'publication_fee', 'service_listing_fee',
                    'schedule_activation_fee', 'appointment_fee', 'whatsapp_bot_message_fee', 'rental_listing_fee', 'payment'));
DELETE FROM public.service_pricing WHERE service_type = 'club_payment_fee';
ALTER TABLE public.service_pricing DROP CONSTRAINT IF EXISTS service_pricing_service_type_check;
ALTER TABLE public.service_pricing ADD CONSTRAINT service_pricing_service_type_check
    CHECK (service_type IN ('ride_fee', 'service_fee', 'order_fee', 'in_person_fee', 'product_fee', 'publication_fee', 'service_listing_fee',
                            'schedule_activation_fee', 'appointment_fee', 'whatsapp_bot_message_fee', 'whatsapp_bot_message_fee_postpaid', 'rental_listing_fee'));

-- acesso e biblioteca voltam a só enxergar compra e "pegar grátis"
CREATE OR REPLACE FUNCTION public._digital_access(p_product uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_uid IS NOT NULL AND (
        EXISTS (SELECT 1 FROM public.products p WHERE p.id = p_product AND p.owner_id = p_uid)
        OR EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
                    WHERE oi.product_id = p_product AND o.buyer_id = p_uid AND o.status = 'paid')
        OR EXISTS (SELECT 1 FROM public.digital_claims dc WHERE dc.product_id = p_product AND dc.profile_id = p_uid));
$$;
REVOKE ALL ON FUNCTION public._digital_access(uuid, uuid) FROM PUBLIC, anon, authenticated;
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
           ) x
      JOIN public.products p ON p.id = x.product_id AND p.type = 'digital'
      LEFT JOIN public.stores s ON s.id = p.store_id
     WHERE auth.uid() IS NOT NULL
     GROUP BY p.id, p.name, p.slug, s."storeSlug", s.name, p.image_url
     ORDER BY max(x.at) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_digital_library() TO authenticated;
DROP FUNCTION IF EXISTS public._club_music_access(uuid, uuid);

CREATE OR REPLACE FUNCTION public.join_vip_club(p_store_id uuid)
RETURNS public.store_vip_members LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_store public.stores; v_member public.store_vip_members;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id;
    IF NOT FOUND OR NOT v_store.vip_club_enabled THEN RAISE EXCEPTION 'Essa loja não tem clube VIP ativo'; END IF;
    IF v_store.vip_club_price IS NOT NULL THEN RAISE EXCEPTION 'Clube pago em breve'; END IF;
    INSERT INTO public.store_vip_members (store_id, profile_id, status, source) VALUES (p_store_id, auth.uid(), 'active', 'free')
    ON CONFLICT (store_id, profile_id) DO UPDATE SET status = 'active' RETURNING * INTO v_member;
    RETURN v_member;
END $$;
REVOKE ALL ON FUNCTION public.join_vip_club(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_vip_club(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.get_club_panel(uuid);
DROP FUNCTION IF EXISTS public.resolve_club_payment(uuid, boolean);
DROP FUNCTION IF EXISTS public.report_club_payment_paid(uuid);
DROP FUNCTION IF EXISTS public.start_club_payment(uuid);
DROP FUNCTION IF EXISTS public.set_club_settings(uuid, integer, boolean);
DROP FUNCTION IF EXISTS public.get_club_info(uuid);
DROP TABLE IF EXISTS public.store_club_payments;
DROP TABLE IF EXISTS public.store_club_settings;
UPDATE public.stores s SET vip_club_price = NULL WHERE vip_club_price IS NOT NULL;   -- o clube pago deixa de existir: volta tudo a grátis
DELETE FROM public.store_vip_members WHERE source = 'pix';
ALTER TABLE public.store_vip_members DROP CONSTRAINT IF EXISTS store_vip_members_source_check;
ALTER TABLE public.store_vip_members ADD CONSTRAINT store_vip_members_source_check CHECK (source IN ('free', 'asaas'));
