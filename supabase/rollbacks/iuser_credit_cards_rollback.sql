-- Desfaz 20261130000085_iuser_credit_cards.sql (devolve _apply_campaign_discount à regra só do Club VIP, da 20261088000000).
-- ATENÇÃO: apaga as campanhas, os códigos e o registro do que o iUser deve às lojas. Exporte antes se houver valores a pagar.
DROP TRIGGER IF EXISTS orders_iuser_credit_follow ON public.orders;
DROP TRIGGER IF EXISTS orders_iuser_credit_release ON public.orders;
DROP FUNCTION IF EXISTS public.iuser_credit_follow_order();
DROP FUNCTION IF EXISTS public.iuser_credit_release_on_delete();
DROP FUNCTION IF EXISTS public.check_iuser_credit(text, uuid);
DROP FUNCTION IF EXISTS public.get_store_iuser_credits(uuid);
DROP FUNCTION IF EXISTS public.admin_credit_create_campaign(text, numeric, numeric, timestamptz, int, uuid);
DROP FUNCTION IF EXISTS public.admin_credit_add_codes(uuid, int, uuid);
DROP FUNCTION IF EXISTS public.admin_credit_set_active(uuid, boolean, uuid);
DROP FUNCTION IF EXISTS public.admin_credit_overview();
DROP FUNCTION IF EXISTS public.admin_credit_codes(uuid);
DROP FUNCTION IF EXISTS public.admin_credit_mark_paid(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public._apply_campaign_discount(p_code text, p_store uuid, p_order uuid, p_via text, p_items jsonb)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    red public.store_campaign_redemptions;
    camp public.store_campaigns;
    v_eligible numeric;
    v_discount numeric;
    v_updated integer;
BEGIN
    SELECT * INTO red FROM public.store_campaign_redemptions WHERE code = upper(btrim(p_code)) FOR UPDATE;
    IF NOT FOUND OR red.status <> 'available' THEN RAISE EXCEPTION 'Código inválido ou já usado'; END IF;
    SELECT * INTO camp FROM public.store_campaigns WHERE id = red.campaign_id;
    IF NOT FOUND OR NOT camp.active OR (camp.ends_at IS NOT NULL AND camp.ends_at <= now()) THEN RAISE EXCEPTION 'Código inválido ou já usado'; END IF;
    IF camp.store_id <> p_store THEN RAISE EXCEPTION 'Esse código não é dessa loja'; END IF;
    SELECT COALESCE(sum((i->>'total_price')::numeric), 0) INTO v_eligible
      FROM jsonb_array_elements(p_items) i
     WHERE (i->>'product_id')::uuid = ANY (camp.product_ids);
    v_discount := CASE camp.discount_type
        WHEN 'full' THEN v_eligible
        WHEN 'percent' THEN v_eligible * (COALESCE(camp.discount_value, 0) / 100)
        ELSE LEAST(COALESCE(camp.discount_value, 0), v_eligible)
    END;
    UPDATE public.store_campaign_redemptions
       SET status = 'redeemed', redeemed_at = now(), redeemed_via = p_via, order_id = p_order
     WHERE id = red.id AND status = 'available';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RAISE EXCEPTION 'Código inválido ou já usado'; END IF;
    RETURN round(v_discount, 2);
END;
$$;
REVOKE ALL ON FUNCTION public._apply_campaign_discount(text, uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

DROP TABLE IF EXISTS public.iuser_store_credits;
DROP TABLE IF EXISTS public.iuser_credit_codes;
DROP TABLE IF EXISTS public.iuser_credit_campaigns;
DROP FUNCTION IF EXISTS public._iuser_credit_new_code();
