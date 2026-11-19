-- 20261130000085_iuser_credit_cards.sql
--
-- CARTÕES DE CRÉDITO DO iUSER (18/11/2026; decisão do dono: "o iUser paga"). Divulgação na rua: o iUser imprime cartões com um CÓDIGO
-- (ex.: IU7K2M9QXA) que vale R$ X de desconto num pedido em QUALQUER loja do iUser. O cliente paga à loja o total já com o desconto e o
-- iUSER FICA DEVENDO esse valor à LOJA (o iUser continua sem tocar no dinheiro do pedido: ele acerta com a loja por fora, por Pix).
--   - Campanha (admin): nome, valor, pedido mínimo, validade, quantos códigos. Os códigos são gerados aqui (10 letras sem as ambíguas).
--   - Uso: o código entra pelo MESMO campo de código do carrinho; o banco confere tudo dentro de create_store_order
--     (_apply_campaign_discount ganhou o ramo do iUser): logado, campanha ativa e no prazo, pedido mínimo, 1 uso por pessoa por campanha,
--     nunca na própria loja, só pedido pelo app (não no balcão). Desconto = o menor entre o valor e os itens (nunca o frete).
--   - Dívida do iUser com a loja (iuser_store_credits): nasce 'pending'; pedido pago → 'due' (o iUser deve pagar); pedido recusado/cancelado
--     → 'void' e o código volta a valer. O admin marca 'paid' depois de mandar o Pix (Admin → Créditos).
-- Tudo só por função (as tabelas não têm acesso do app). Rollback: supabase/rollbacks/iuser_credit_cards_rollback.sql.
-- Cenários: supabase/tests/iuser_credit_cards_scenarios.sql.

CREATE TABLE IF NOT EXISTS public.iuser_credit_campaigns (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
    value       numeric(10,2) NOT NULL CHECK (value > 0 AND value <= 500),
    min_order   numeric(10,2) NOT NULL DEFAULT 0 CHECK (min_order >= 0 AND min_order <= 5000),
    starts_at   timestamptz NOT NULL DEFAULT now(),
    ends_at     timestamptz,
    active      boolean NOT NULL DEFAULT true,
    created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.iuser_credit_codes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id uuid NOT NULL REFERENCES public.iuser_credit_campaigns(id) ON DELETE CASCADE,
    code        text NOT NULL UNIQUE,
    status      text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'used')),
    used_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    used_at     timestamptz,
    order_id    uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iuser_credit_codes_campaign_idx ON public.iuser_credit_codes (campaign_id, status);
CREATE INDEX IF NOT EXISTS iuser_credit_codes_used_by_idx ON public.iuser_credit_codes (used_by, campaign_id) WHERE used_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.iuser_store_credits (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id    uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    code_id     uuid REFERENCES public.iuser_credit_codes(id) ON DELETE SET NULL,
    amount      numeric(10,2) NOT NULL CHECK (amount > 0),
    status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'due', 'paid', 'void')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    due_at      timestamptz,
    paid_at     timestamptz,
    paid_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    paid_note   text
);
CREATE INDEX IF NOT EXISTS iuser_store_credits_store_idx ON public.iuser_store_credits (store_id, status);

ALTER TABLE public.iuser_credit_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iuser_credit_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iuser_store_credits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.iuser_credit_campaigns, public.iuser_credit_codes, public.iuser_store_credits FROM anon, authenticated;

-- código: 2 letras fixas + 8 sem as ambíguas (sem 0/O, 1/I/L)
CREATE OR REPLACE FUNCTION public._iuser_credit_new_code() RETURNS text LANGUAGE plpgsql AS $$
DECLARE a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; i int;
BEGIN
    LOOP
        c := 'IU';
        FOR i IN 1..8 LOOP c := c || substr(a, 1 + floor(random() * length(a))::int, 1); END LOOP;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.iuser_credit_codes WHERE code = c)
              AND NOT EXISTS (SELECT 1 FROM public.store_campaign_redemptions WHERE code = c);
    END LOOP;
    RETURN c;
END; $$;
REVOKE ALL ON FUNCTION public._iuser_credit_new_code() FROM PUBLIC, anon, authenticated;

-- ── o desconto dentro do pedido: código do iUSER primeiro, senão o código do Club VIP da loja (a regra de antes, igual) ──────────────
CREATE OR REPLACE FUNCTION public._apply_campaign_discount(p_code text, p_store uuid, p_order uuid, p_via text, p_items jsonb)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    red public.store_campaign_redemptions;
    camp public.store_campaigns;
    ic public.iuser_credit_codes;
    icamp public.iuser_credit_campaigns;
    v_uid uuid := auth.uid();
    v_items numeric;
    v_eligible numeric;
    v_discount numeric;
    v_updated integer;
BEGIN
    SELECT * INTO ic FROM public.iuser_credit_codes WHERE code = upper(btrim(p_code)) FOR UPDATE;
    IF FOUND THEN
        IF ic.status <> 'available' THEN RAISE EXCEPTION 'Este cartão do iUser já foi usado' USING HINT = 'credit_used'; END IF;
        SELECT * INTO icamp FROM public.iuser_credit_campaigns WHERE id = ic.campaign_id;
        IF NOT icamp.active OR icamp.starts_at > now() OR (icamp.ends_at IS NOT NULL AND icamp.ends_at <= now()) THEN
            RAISE EXCEPTION 'Este cartão do iUser está fora do prazo' USING HINT = 'credit_expired';
        END IF;
        IF p_via <> 'cart' OR v_uid IS NULL THEN RAISE EXCEPTION 'O cartão do iUser vale só em pedido feito pelo app' USING HINT = 'credit_app_only'; END IF;
        IF EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = v_uid) THEN
            RAISE EXCEPTION 'O cartão do iUser não vale na sua própria loja' USING HINT = 'credit_own_store';
        END IF;
        IF EXISTS (SELECT 1 FROM public.iuser_credit_codes WHERE campaign_id = ic.campaign_id AND used_by = v_uid AND status = 'used') THEN
            RAISE EXCEPTION 'Você já usou um cartão desta campanha' USING HINT = 'credit_once';
        END IF;
        SELECT COALESCE(sum((i->>'total_price')::numeric), 0) INTO v_items FROM jsonb_array_elements(p_items) i;
        IF v_items < icamp.min_order THEN
            RAISE EXCEPTION 'O cartão vale em pedidos a partir de R$ %', to_char(icamp.min_order, 'FM999990D00') USING HINT = 'credit_min_order';
        END IF;
        v_discount := round(LEAST(icamp.value, v_items), 2);
        UPDATE public.iuser_credit_codes SET status = 'used', used_by = v_uid, used_at = now(), order_id = p_order
         WHERE id = ic.id AND status = 'available';
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated = 0 THEN RAISE EXCEPTION 'Este cartão do iUser já foi usado' USING HINT = 'credit_used'; END IF;
        IF v_discount > 0 THEN
            INSERT INTO public.iuser_store_credits (store_id, order_id, code_id, amount) VALUES (p_store, p_order, ic.id, v_discount);
        END IF;
        RETURN v_discount;
    END IF;

    -- Club VIP da loja (igual à 20261088000000)
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

-- ── o carrinho confere ANTES de fechar (não gasta o código): diz quanto vale ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_iuser_credit(p_code text, p_store uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); ic public.iuser_credit_codes; icamp public.iuser_credit_campaigns;
BEGIN
    IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'found', false, 'error', 'Entre na sua conta para usar o cartão'); END IF;
    SELECT * INTO ic FROM public.iuser_credit_codes WHERE code = upper(btrim(COALESCE(p_code, '')));
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'found', false); END IF;
    SELECT * INTO icamp FROM public.iuser_credit_campaigns WHERE id = ic.campaign_id;
    IF ic.status <> 'available' THEN RETURN jsonb_build_object('ok', false, 'found', true, 'error', 'Este cartão do iUser já foi usado'); END IF;
    IF NOT icamp.active OR icamp.starts_at > now() OR (icamp.ends_at IS NOT NULL AND icamp.ends_at <= now()) THEN
        RETURN jsonb_build_object('ok', false, 'found', true, 'error', 'Este cartão do iUser está fora do prazo');
    END IF;
    IF p_store IS NOT NULL AND EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = v_uid) THEN
        RETURN jsonb_build_object('ok', false, 'found', true, 'error', 'O cartão do iUser não vale na sua própria loja');
    END IF;
    IF EXISTS (SELECT 1 FROM public.iuser_credit_codes WHERE campaign_id = ic.campaign_id AND used_by = v_uid AND status = 'used') THEN
        RETURN jsonb_build_object('ok', false, 'found', true, 'error', 'Você já usou um cartão desta campanha');
    END IF;
    RETURN jsonb_build_object('ok', true, 'found', true, 'value', icamp.value, 'min_order', icamp.min_order, 'name', icamp.name, 'ends_at', icamp.ends_at);
END; $$;
REVOKE ALL ON FUNCTION public.check_iuser_credit(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_iuser_credit(text, uuid) TO authenticated;

-- ── o pedido acaba: pago → o iUser deve; recusado/cancelado → anula e o código volta a valer ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.iuser_credit_follow_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    IF NEW.status = 'paid' THEN
        UPDATE public.iuser_store_credits SET status = 'due', due_at = now() WHERE order_id = NEW.id AND status = 'pending';
    ELSIF NEW.status = 'rejected' THEN
        UPDATE public.iuser_credit_codes SET status = 'available', used_by = NULL, used_at = NULL, order_id = NULL
         WHERE id IN (SELECT code_id FROM public.iuser_store_credits WHERE order_id = NEW.id AND status = 'pending');
        UPDATE public.iuser_store_credits SET status = 'void' WHERE order_id = NEW.id AND status = 'pending';
    END IF;
    RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.iuser_credit_follow_order() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS orders_iuser_credit_follow ON public.orders;
CREATE TRIGGER orders_iuser_credit_follow AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.iuser_credit_follow_order();

-- pedido apagado pelo comprador antes de a loja agir: o código volta
CREATE OR REPLACE FUNCTION public.iuser_credit_release_on_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.iuser_credit_codes SET status = 'available', used_by = NULL, used_at = NULL, order_id = NULL WHERE order_id = OLD.id AND status = 'used';
    RETURN OLD;
END; $$;
REVOKE ALL ON FUNCTION public.iuser_credit_release_on_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS orders_iuser_credit_release ON public.orders;
CREATE TRIGGER orders_iuser_credit_release BEFORE DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.iuser_credit_release_on_delete();

-- ── a LOJA vê o que o iUser deve a ela ─────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_store_iuser_credits(p_store uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN
        RAISE EXCEPTION 'Só a dona da loja vê isto' USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object(
        'due', COALESCE((SELECT sum(amount) FROM public.iuser_store_credits WHERE store_id = p_store AND status = 'due'), 0),
        'pending', COALESCE((SELECT sum(amount) FROM public.iuser_store_credits WHERE store_id = p_store AND status = 'pending'), 0),
        'paid', COALESCE((SELECT sum(amount) FROM public.iuser_store_credits WHERE store_id = p_store AND status = 'paid'), 0),
        'recent', COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
            SELECT c.order_id, c.amount, c.status, c.created_at, c.paid_at FROM public.iuser_store_credits c
             WHERE c.store_id = p_store AND c.status <> 'void' ORDER BY c.created_at DESC LIMIT 20) x), '[]'::jsonb));
END; $$;
REVOKE ALL ON FUNCTION public.get_store_iuser_credits(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_iuser_credits(uuid) TO authenticated;

-- ── ADMIN (só o serviço; a rota confere o admin geral e manda o id dele) ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_credit_create_campaign(p_name text, p_value numeric, p_min_order numeric, p_ends_at timestamptz, p_codes int, p_admin uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; i int;
BEGIN
    IF p_codes IS NULL OR p_codes < 1 OR p_codes > 2000 THEN RAISE EXCEPTION 'Quantidade de cartões: de 1 a 2.000'; END IF;
    INSERT INTO public.iuser_credit_campaigns (name, value, min_order, ends_at, created_by)
    VALUES (btrim(p_name), round(p_value, 2), round(COALESCE(p_min_order, 0), 2), p_ends_at, p_admin) RETURNING id INTO v_id;
    FOR i IN 1..p_codes LOOP
        INSERT INTO public.iuser_credit_codes (campaign_id, code) VALUES (v_id, public._iuser_credit_new_code());
    END LOOP;
    INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by)
    VALUES ('iuser_credits', 'create_campaign', NULL,
            jsonb_build_object('campaign', v_id, 'name', p_name, 'value', p_value, 'min_order', p_min_order, 'ends_at', p_ends_at, 'codes', p_codes), p_admin);
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_credit_add_codes(p_campaign uuid, p_codes int, p_admin uuid) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i int;
BEGIN
    IF p_codes IS NULL OR p_codes < 1 OR p_codes > 2000 THEN RAISE EXCEPTION 'Quantidade de cartões: de 1 a 2.000'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.iuser_credit_campaigns WHERE id = p_campaign) THEN RAISE EXCEPTION 'Campanha não encontrada'; END IF;
    FOR i IN 1..p_codes LOOP
        INSERT INTO public.iuser_credit_codes (campaign_id, code) VALUES (p_campaign, public._iuser_credit_new_code());
    END LOOP;
    INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by)
    VALUES ('iuser_credits', 'add_codes', NULL, jsonb_build_object('campaign', p_campaign, 'codes', p_codes), p_admin);
    RETURN p_codes;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_credit_set_active(p_campaign uuid, p_active boolean, p_admin uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.iuser_credit_campaigns SET active = p_active WHERE id = p_campaign;
    INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by)
    VALUES ('iuser_credits', 'set_active', NULL, jsonb_build_object('campaign', p_campaign, 'active', p_active), p_admin);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_credit_overview() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object(
        'campaigns', COALESCE((SELECT jsonb_agg(x ORDER BY x.created_at DESC) FROM (
            SELECT c.id, c.name, c.value, c.min_order, c.ends_at, c.active, c.created_at,
                   (SELECT count(*) FROM public.iuser_credit_codes k WHERE k.campaign_id = c.id) AS codes,
                   (SELECT count(*) FROM public.iuser_credit_codes k WHERE k.campaign_id = c.id AND k.status = 'used') AS used,
                   COALESCE((SELECT sum(s.amount) FROM public.iuser_store_credits s JOIN public.iuser_credit_codes k ON k.id = s.code_id
                              WHERE k.campaign_id = c.id AND s.status IN ('pending', 'due', 'paid')), 0) AS spent
              FROM public.iuser_credit_campaigns c) x), '[]'::jsonb),
        'stores', COALESCE((SELECT jsonb_agg(y ORDER BY y.due DESC) FROM (
            SELECT st.id AS store_id, st.name, st."storeSlug" AS slug,
                   COALESCE(sum(s.amount) FILTER (WHERE s.status = 'due'), 0) AS due,
                   COALESCE(sum(s.amount) FILTER (WHERE s.status = 'pending'), 0) AS pending,
                   COALESCE(sum(s.amount) FILTER (WHERE s.status = 'paid'), 0) AS paid,
                   (SELECT k.pix_key FROM public.stores k WHERE k.id = st.id) AS pix_key
              FROM public.iuser_store_credits s JOIN public.stores st ON st.id = s.store_id
             WHERE s.status <> 'void'
             GROUP BY st.id, st.name, st."storeSlug") y), '[]'::jsonb),
        'totals', jsonb_build_object(
            'due', COALESCE((SELECT sum(amount) FROM public.iuser_store_credits WHERE status = 'due'), 0),
            'pending', COALESCE((SELECT sum(amount) FROM public.iuser_store_credits WHERE status = 'pending'), 0),
            'paid', COALESCE((SELECT sum(amount) FROM public.iuser_store_credits WHERE status = 'paid'), 0)))
$$;

CREATE OR REPLACE FUNCTION public.admin_credit_codes(p_campaign uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object('code', code, 'status', status) ORDER BY created_at, code), '[]'::jsonb)
      FROM public.iuser_credit_codes WHERE campaign_id = p_campaign
$$;

CREATE OR REPLACE FUNCTION public.admin_credit_mark_paid(p_store uuid, p_admin uuid, p_note text DEFAULT NULL) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v numeric;
BEGIN
    WITH u AS (
        UPDATE public.iuser_store_credits SET status = 'paid', paid_at = now(), paid_by = p_admin, paid_note = left(btrim(COALESCE(p_note, '')), 200)
         WHERE store_id = p_store AND status = 'due' RETURNING amount)
    SELECT COALESCE(sum(amount), 0) INTO v FROM u;
    INSERT INTO public.admin_config_audit (scope, setting, old_value, new_value, changed_by)
    VALUES ('iuser_credits', 'mark_paid', NULL, jsonb_build_object('store', p_store, 'amount', v, 'note', p_note), p_admin);
    RETURN v;
END; $$;

REVOKE ALL ON FUNCTION public.admin_credit_create_campaign(text, numeric, numeric, timestamptz, int, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_credit_add_codes(uuid, int, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_credit_set_active(uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_credit_overview() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_credit_codes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_credit_mark_paid(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_credit_create_campaign(text, numeric, numeric, timestamptz, int, uuid),
    public.admin_credit_add_codes(uuid, int, uuid), public.admin_credit_set_active(uuid, boolean, uuid), public.admin_credit_overview(),
    public.admin_credit_codes(uuid), public.admin_credit_mark_paid(uuid, uuid, text) TO service_role;
