-- Club VIP por loja: espaço exclusivo pra quem entra no clube daquela loja
-- (o dono escolhe se é gratuito ou pago — só o gratuito funciona de verdade
-- nessa fase, o pago fica com schema pronta mas cobrança real vem depois).
-- Dentro do clube, o dono publica "campanhas" (desconto ou resgate grátis
-- num ou mais produtos) e cada membro resgata um código único, usado tanto
-- no carrinho quanto numa venda presencial.

ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS vip_club_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS vip_club_price NUMERIC(10, 2) NULL,
    ADD COLUMN IF NOT EXISTS vip_club_description TEXT NULL;

-- ===== store_vip_members =====
CREATE TABLE IF NOT EXISTS public.store_vip_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'canceled')),
    source TEXT NOT NULL DEFAULT 'free' CHECK (source IN ('free', 'asaas')),
    asaas_customer_id TEXT,
    asaas_subscription_id TEXT,
    current_period_end TIMESTAMPTZ,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, profile_id)
);
CREATE INDEX IF NOT EXISTS store_vip_members_store_idx ON public.store_vip_members (store_id);
CREATE INDEX IF NOT EXISTS store_vip_members_profile_idx ON public.store_vip_members (profile_id);

ALTER TABLE public.store_vip_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membro vê a própria linha" ON public.store_vip_members
    FOR SELECT USING (auth.uid() = profile_id);

CREATE POLICY "Dono da loja vê os membros dela" ON public.store_vip_members
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    );

-- Entrar num clube gratuito é auto-serviço; clube pago (Fase 2) não passa
-- por aqui — vem de uma rota service-role depois do pagamento confirmado.
CREATE POLICY "Usuário entra em clube gratuito" ON public.store_vip_members
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = profile_id
        AND source = 'free'
        AND status = 'active'
        AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.vip_club_enabled = true AND s.vip_club_price IS NULL)
    );

-- ===== store_campaigns =====
CREATE TABLE IF NOT EXISTS public.store_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    publication_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed', 'full')),
    discount_value NUMERIC(10, 2) NULL,
    product_ids UUID[] NOT NULL,
    max_redemptions_per_member INTEGER NOT NULL DEFAULT 1,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ends_at TIMESTAMPTZ NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT store_campaigns_discount_value_check CHECK (
        (discount_type = 'full' AND discount_value IS NULL)
        OR (discount_type IN ('percent', 'fixed') AND discount_value IS NOT NULL AND discount_value > 0)
    )
);
CREATE INDEX IF NOT EXISTS store_campaigns_store_idx ON public.store_campaigns (store_id);

ALTER TABLE public.store_campaigns ENABLE ROW LEVEL SECURITY;
-- Sem policy de select/insert pro client — leitura via get_vip_campaigns,
-- escrita via rota do dono (supabaseAdmin, depois de conferir que é o
-- owner da loja).

-- ===== store_campaign_redemptions =====
CREATE TABLE IF NOT EXISTS public.store_campaign_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.store_campaigns(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'redeemed', 'expired')),
    redeemed_at TIMESTAMPTZ,
    redeemed_via TEXT CHECK (redeemed_via IN ('cart', 'in_person')),
    order_id UUID REFERENCES public.orders(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (campaign_id, member_id)
);
CREATE INDEX IF NOT EXISTS store_campaign_redemptions_code_idx ON public.store_campaign_redemptions (code);

ALTER TABLE public.store_campaign_redemptions ENABLE ROW LEVEL SECURITY;
-- Sem policy de select/insert/update pro client — o código é a prova de
-- posse; tudo passa pelas funções abaixo (security definer).

-- ===== join_vip_club =====
-- Só cobre clube gratuito nessa fase — clube pago vem de uma rota
-- service-role depois de confirmar o pagamento (Fase 2).
CREATE OR REPLACE FUNCTION public.join_vip_club(p_store_id uuid)
RETURNS public.store_vip_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store public.stores;
    v_member public.store_vip_members;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Não autenticado';
    END IF;

    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id;
    IF NOT FOUND OR NOT v_store.vip_club_enabled THEN
        RAISE EXCEPTION 'Essa loja não tem clube VIP ativo';
    END IF;
    IF v_store.vip_club_price IS NOT NULL THEN
        RAISE EXCEPTION 'Clube pago em breve';
    END IF;

    INSERT INTO public.store_vip_members (store_id, profile_id, status, source)
    VALUES (p_store_id, auth.uid(), 'active', 'free')
    ON CONFLICT (store_id, profile_id) DO UPDATE SET status = 'active'
    RETURNING * INTO v_member;

    RETURN v_member;
END;
$$;

REVOKE ALL ON FUNCTION public.join_vip_club(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.join_vip_club(uuid) TO authenticated;

-- ===== get_vip_campaigns =====
-- Só membro ativo (ou o dono da loja) vê as campanhas — evita ter que
-- mexer na RLS já existente e genérica de public.products.
CREATE OR REPLACE FUNCTION public.get_vip_campaigns(p_store_id uuid)
RETURNS TABLE(
    campaign_id uuid,
    publication_id uuid,
    name text,
    description text,
    image_url text,
    discount_type text,
    discount_value numeric,
    product_ids uuid[],
    ends_at timestamptz,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_is_member boolean;
    v_is_owner boolean;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Não autenticado';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.store_vip_members m
        WHERE m.store_id = p_store_id AND m.profile_id = auth.uid() AND m.status = 'active'
    ) INTO v_is_member;

    SELECT EXISTS(
        SELECT 1 FROM public.stores s WHERE s.id = p_store_id AND s.owner_id = auth.uid()
    ) INTO v_is_owner;

    IF NOT v_is_member AND NOT v_is_owner THEN
        RAISE EXCEPTION 'Você não é membro desse clube VIP';
    END IF;

    RETURN QUERY
    SELECT c.id, c.publication_id, p.name, p.description, p.image_url,
           c.discount_type, c.discount_value, c.product_ids, c.ends_at, c.created_at
    FROM public.store_campaigns c
    JOIN public.products p ON p.id = c.publication_id
    WHERE c.store_id = p_store_id
        AND c.active = true
        AND (c.ends_at IS NULL OR c.ends_at > now())
    ORDER BY c.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_vip_campaigns(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_vip_campaigns(uuid) TO authenticated;

-- ===== redeem_campaign_code =====
-- Idempotente: se o membro já tinha resgatado (gerado o código) pra essa
-- campanha, devolve o mesmo código em vez de duplicar.
CREATE OR REPLACE FUNCTION public.redeem_campaign_code(p_campaign_id uuid)
RETURNS public.store_campaign_redemptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_campaign public.store_campaigns;
    v_is_member boolean;
    v_existing public.store_campaign_redemptions;
    v_new_code text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Não autenticado';
    END IF;

    SELECT * INTO v_campaign FROM public.store_campaigns WHERE id = p_campaign_id;
    IF NOT FOUND OR NOT v_campaign.active OR (v_campaign.ends_at IS NOT NULL AND v_campaign.ends_at <= now()) THEN
        RAISE EXCEPTION 'Campanha não disponível';
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM public.store_vip_members m
        WHERE m.store_id = v_campaign.store_id AND m.profile_id = auth.uid() AND m.status = 'active'
    ) INTO v_is_member;
    IF NOT v_is_member THEN
        RAISE EXCEPTION 'Você não é membro desse clube VIP';
    END IF;

    SELECT * INTO v_existing
    FROM public.store_campaign_redemptions
    WHERE campaign_id = p_campaign_id AND member_id = auth.uid();
    IF FOUND THEN
        RETURN v_existing;
    END IF;

    v_new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

    INSERT INTO public.store_campaign_redemptions (campaign_id, member_id, code, status)
    VALUES (p_campaign_id, auth.uid(), v_new_code, 'available')
    RETURNING * INTO v_existing;

    RETURN v_existing;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_campaign_code(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_campaign_code(uuid) TO authenticated;

-- ===== validate_campaign_code =====
-- Leitura, chamada pelos checkouts (carrinho e venda presencial) antes de
-- fechar o pedido, pra saber quanto descontar.
CREATE OR REPLACE FUNCTION public.validate_campaign_code(p_code text)
RETURNS TABLE(
    redemption_id uuid,
    store_id uuid,
    discount_type text,
    discount_value numeric,
    product_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_redemption public.store_campaign_redemptions;
    v_campaign public.store_campaigns;
BEGIN
    SELECT * INTO v_redemption FROM public.store_campaign_redemptions WHERE code = upper(trim(p_code));
    IF NOT FOUND OR v_redemption.status != 'available' THEN
        RAISE EXCEPTION 'Código inválido ou já usado';
    END IF;

    SELECT * INTO v_campaign FROM public.store_campaigns WHERE id = v_redemption.campaign_id;
    IF NOT FOUND OR NOT v_campaign.active OR (v_campaign.ends_at IS NOT NULL AND v_campaign.ends_at <= now()) THEN
        RAISE EXCEPTION 'Código inválido ou já usado';
    END IF;

    RETURN QUERY SELECT v_redemption.id, v_campaign.store_id, v_campaign.discount_type, v_campaign.discount_value, v_campaign.product_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_campaign_code(text) FROM public;
GRANT EXECUTE ON FUNCTION public.validate_campaign_code(text) TO authenticated;

-- ===== consume_campaign_code =====
-- Chamada só depois que o pedido (orders) já foi criado com sucesso —
-- trava por status='available' evita reuso/corrida (2 checkouts ao mesmo
-- tempo com o mesmo código só um vence).
CREATE OR REPLACE FUNCTION public.consume_campaign_code(p_code text, p_order_id uuid, p_via text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated integer;
BEGIN
    IF p_via NOT IN ('cart', 'in_person') THEN
        RAISE EXCEPTION 'Via inválida';
    END IF;

    UPDATE public.store_campaign_redemptions
        SET status = 'redeemed', redeemed_at = now(), redeemed_via = p_via, order_id = p_order_id
        WHERE code = upper(trim(p_code)) AND status = 'available';

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_campaign_code(text, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.consume_campaign_code(text, uuid, text) TO authenticated;
