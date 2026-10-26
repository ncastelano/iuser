-- Aluguel de imóveis (versão 1): qualquer pessoa ou loja anuncia casa, apartamento, quarto, sala comercial etc.; o interessado busca,
-- agenda a VISITA (o agendamento que já existe), e os dois lados se avaliam (appointment_reviews) com o mesmo respaldo dos serviços.
--
--  * Todo tipo de aluguel: `rental_kind` mensal (preço por mês) ou temporada (preço por dia, mínimo de diárias, hóspedes) — pronto para crescer.
--  * Privacidade: o anúncio público mostra só bairro/cidade e posição aproximada; o endereço completo mora em `rental_listing_private` e só sai
--    para o dono e para quem tem visita CONFIRMADA (ou feita) naquele imóvel (`get_rental_address`).
--  * Cobrança igual ao resto do iUser: anunciar exige plano ativo; no PÓS-PAGO cada imóvel anunciado gera a taxa `rental_listing_fee`
--    (R$ 0,50 por padrão, editável em Admin → Planos); pré-pago e brinde não pagam; dívida do pós-pago >= R$ 50 trava novos anúncios.
--  * Confiança: `get_rental_host_trust` calcula o selo (Imobiliária / Anunciante confiável) pelo histórico real, sem ninguém escolher.
-- Rollback: supabase/rollbacks/rentals_rollback.sql.

-- ===== Anúncio =====
CREATE TABLE IF NOT EXISTS public.rental_listings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,           -- anúncio feito em nome de uma imobiliária/loja
    title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
    description text CHECK (description IS NULL OR char_length(description) <= 4000),
    property_type text NOT NULL CHECK (property_type IN ('casa', 'apartamento', 'kitnet', 'quarto', 'sala_comercial', 'loja', 'galpao', 'chacara', 'terreno', 'outro')),
    rental_kind text NOT NULL DEFAULT 'mensal' CHECK (rental_kind IN ('mensal', 'temporada')),
    price_period text NOT NULL DEFAULT 'mes' CHECK (price_period IN ('mes', 'dia')),
    price numeric(12, 2) NOT NULL CHECK (price >= 0),
    condo_fee numeric(12, 2) NOT NULL DEFAULT 0 CHECK (condo_fee >= 0),
    iptu_fee numeric(12, 2) NOT NULL DEFAULT 0 CHECK (iptu_fee >= 0),
    deposit_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),    -- caução
    bedrooms integer CHECK (bedrooms IS NULL OR bedrooms BETWEEN 0 AND 30),
    bathrooms integer CHECK (bathrooms IS NULL OR bathrooms BETWEEN 0 AND 30),
    parking integer CHECK (parking IS NULL OR parking BETWEEN 0 AND 30),
    area_m2 numeric(10, 2) CHECK (area_m2 IS NULL OR area_m2 > 0),
    furnished boolean NOT NULL DEFAULT false,
    pets_allowed boolean NOT NULL DEFAULT false,
    amenities text[] NOT NULL DEFAULT '{}',
    rules text CHECK (rules IS NULL OR char_length(rules) <= 1500),
    photos text[] NOT NULL DEFAULT '{}' CHECK (cardinality(photos) <= 12),          -- caminhos no bucket product-images
    neighborhood text NOT NULL CHECK (char_length(btrim(neighborhood)) >= 2),
    city text NOT NULL CHECK (char_length(btrim(city)) >= 2),
    state text,
    approx_lat double precision,                                                       -- arredondado (~1 km): nunca a porta
    approx_lng double precision,
    available_from date,
    min_stay_days integer CHECK (min_stay_days IS NULL OR min_stay_days >= 1),          -- temporada
    max_guests integer CHECK (max_guests IS NULL OR max_guests >= 1),                   -- temporada
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'rented')),
    view_count integer NOT NULL DEFAULT 0,
    rented_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT rental_period_matches_kind CHECK ((rental_kind = 'mensal' AND price_period = 'mes') OR (rental_kind = 'temporada' AND price_period = 'dia'))
);
CREATE INDEX IF NOT EXISTS rental_listings_search_idx ON public.rental_listings (status, city, rental_kind, price);
CREATE INDEX IF NOT EXISTS rental_listings_owner_idx ON public.rental_listings (owner_id, created_at DESC);

-- Endereço completo: só o dono (e quem tem visita confirmada, pela função abaixo)
CREATE TABLE IF NOT EXISTS public.rental_listing_private (
    listing_id uuid PRIMARY KEY REFERENCES public.rental_listings(id) ON DELETE CASCADE,
    address text NOT NULL,
    number text,
    complement text,
    lat double precision,
    lng double precision
);

ALTER TABLE public.rental_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_listing_private ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_listings, public.rental_listing_private FROM anon, authenticated;
GRANT SELECT ON public.rental_listings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rental_listings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_listing_private TO authenticated;

DROP POLICY IF EXISTS "Ver imóveis ativos (e os meus)" ON public.rental_listings;
CREATE POLICY "Ver imóveis ativos (e os meus)" ON public.rental_listings FOR SELECT TO anon, authenticated
    USING (status = 'active' OR owner_id = auth.uid());
DROP POLICY IF EXISTS "Anunciar imóvel (meu, ou da minha loja)" ON public.rental_listings;
CREATE POLICY "Anunciar imóvel (meu, ou da minha loja)" ON public.rental_listings FOR INSERT TO authenticated
    WITH CHECK (owner_id = auth.uid() AND (store_id IS NULL OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())));
DROP POLICY IF EXISTS "Editar meu imóvel" ON public.rental_listings;
CREATE POLICY "Editar meu imóvel" ON public.rental_listings FOR UPDATE TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid() AND (store_id IS NULL OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())));
DROP POLICY IF EXISTS "Apagar meu imóvel" ON public.rental_listings;
CREATE POLICY "Apagar meu imóvel" ON public.rental_listings FOR DELETE TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Dono lê o endereço do imóvel" ON public.rental_listing_private;
CREATE POLICY "Dono lê o endereço do imóvel" ON public.rental_listing_private FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.id = listing_id AND l.owner_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.rental_listings l WHERE l.id = listing_id AND l.owner_id = auth.uid()));

-- ===== Cobrança (mesmo padrão dos serviços) =====
ALTER TABLE public.driver_postpaid_charges ADD COLUMN IF NOT EXISTS rental_listing_id uuid REFERENCES public.rental_listings(id) ON DELETE SET NULL;
ALTER TABLE public.driver_postpaid_charges DROP CONSTRAINT IF EXISTS driver_postpaid_charges_type_check;
ALTER TABLE public.driver_postpaid_charges ADD CONSTRAINT driver_postpaid_charges_type_check
    CHECK (type IN ('ride_fee', 'service_fee', 'order_fee', 'in_person_fee', 'product_fee', 'publication_fee', 'service_listing_fee',
                    'schedule_activation_fee', 'appointment_fee', 'whatsapp_bot_message_fee', 'rental_listing_fee', 'payment'));
CREATE UNIQUE INDEX IF NOT EXISTS driver_postpaid_rental_listing_dedupe_idx ON public.driver_postpaid_charges (rental_listing_id) WHERE type = 'rental_listing_fee';
ALTER TABLE public.service_pricing DROP CONSTRAINT IF EXISTS service_pricing_service_type_check;
ALTER TABLE public.service_pricing ADD CONSTRAINT service_pricing_service_type_check
    CHECK (service_type IN ('ride_fee', 'service_fee', 'order_fee', 'in_person_fee', 'product_fee', 'publication_fee', 'service_listing_fee',
                            'schedule_activation_fee', 'appointment_fee', 'whatsapp_bot_message_fee', 'whatsapp_bot_message_fee_postpaid', 'rental_listing_fee'));
INSERT INTO public.service_pricing (service_type, label, base_price, postpaid_price)
VALUES ('rental_listing_fee', 'Imóvel anunciado para aluguel', 0.50, 0.50) ON CONFLICT (service_type) DO NOTHING;

-- Antes de anunciar: plano ativo (pós-pago ou pré-pago, os dois liberam) e dívida do pós-pago abaixo de R$ 50
CREATE OR REPLACE FUNCTION public.rental_listing_gate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g record;
BEGIN
    SELECT * INTO g FROM public.get_active_plan_grants(NEW.owner_id);
    IF NOT COALESCE(g.has_provider, false) AND NOT COALESCE(g.has_store, false) THEN
        RAISE EXCEPTION 'Para anunciar um imóvel você precisa de um plano ativo (pós-pago ou pré-pago).';
    END IF;
    IF public.get_driver_postpaid_debt(NEW.owner_id) >= 50 THEN
        RAISE EXCEPTION 'Sua dívida do pós-pago chegou a R$ 50. Quite para anunciar imóveis.';
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rental_listings_gate ON public.rental_listings;
CREATE TRIGGER rental_listings_gate BEFORE INSERT ON public.rental_listings FOR EACH ROW EXECUTE FUNCTION public.rental_listing_gate();

CREATE OR REPLACE FUNCTION public.accrue_postpaid_rental_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF public.is_postpaid_user(NEW.owner_id) THEN
        INSERT INTO public.driver_postpaid_charges (driver_id, rental_listing_id, type, amount)
        VALUES (NEW.owner_id, NEW.id, 'rental_listing_fee', COALESCE((SELECT postpaid_price FROM public.service_pricing WHERE service_type = 'rental_listing_fee'), 0.50))
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rental_listings_fee ON public.rental_listings;
CREATE TRIGGER rental_listings_fee AFTER INSERT ON public.rental_listings FOR EACH ROW EXECUTE FUNCTION public.accrue_postpaid_rental_fee();

CREATE OR REPLACE FUNCTION public.rental_listing_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    IF NEW.status = 'rented' AND OLD.status IS DISTINCT FROM 'rented' THEN NEW.rented_at := now(); END IF;
    IF NEW.status <> 'rented' THEN NEW.rented_at := NULL; END IF;
    NEW.owner_id := OLD.owner_id;      -- o dono não muda
    NEW.view_count := OLD.view_count;  -- visitas só pelo contador
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rental_listings_touch ON public.rental_listings;
CREATE TRIGGER rental_listings_touch BEFORE UPDATE ON public.rental_listings FOR EACH ROW EXECUTE FUNCTION public.rental_listing_touch();

-- ===== Visita = agendamento (o que já existe), ligado ao imóvel =====
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS rental_listing_id uuid REFERENCES public.rental_listings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS appointments_rental_idx ON public.appointments (rental_listing_id) WHERE rental_listing_id IS NOT NULL;

-- A visita tem que ser com quem anuncia o imóvel (e o imóvel precisa estar ativo)
CREATE OR REPLACE FUNCTION public.appointments_rental_link_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l public.rental_listings;
BEGIN
    IF NEW.rental_listing_id IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO l FROM public.rental_listings WHERE id = NEW.rental_listing_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Imóvel não encontrado'; END IF;
    IF l.status <> 'active' THEN RAISE EXCEPTION 'Esse imóvel não está mais disponível para visita.'; END IF;
    IF NEW.provider_profile_id IS DISTINCT FROM l.owner_id THEN RAISE EXCEPTION 'A visita precisa ser marcada com quem anuncia o imóvel.'; END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS appointments_rental_link ON public.appointments;
CREATE TRIGGER appointments_rental_link BEFORE INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.appointments_rental_link_check();

-- Endereço completo: só o dono e quem tem visita confirmada (ou já feita) naquele imóvel
CREATE OR REPLACE FUNCTION public.get_rental_address(p_listing uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid(); l public.rental_listings; p public.rental_listing_private;
BEGIN
    IF v_user IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO l FROM public.rental_listings WHERE id = p_listing;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF l.owner_id <> v_user AND NOT EXISTS (
        SELECT 1 FROM public.appointments a WHERE a.rental_listing_id = p_listing AND a.customer_id = v_user AND a.status IN ('confirmed', 'completed')
    ) THEN RETURN NULL; END IF;
    SELECT * INTO p FROM public.rental_listing_private WHERE listing_id = p_listing;
    IF NOT FOUND THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('address', p.address, 'number', p.number, 'complement', p.complement, 'lat', p.lat, 'lng', p.lng);
END; $$;
REVOKE ALL ON FUNCTION public.get_rental_address(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_rental_address(uuid) TO authenticated;

-- ===== Confiança no anunciante (calculada, ninguém escolhe) =====
-- Imobiliária = anuncia em nome de uma loja. Anunciante confiável = histórico real: 2+ imóveis alugados, 3+ avaliações das visitas, média 4,5+.
CREATE OR REPLACE FUNCTION public.get_rental_host_trust(p_host uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    WITH rv AS (
        SELECT count(*) AS n, COALESCE(round(avg(r.rating)::numeric, 1), 0) AS avg
        FROM public.appointment_reviews r JOIN public.appointments a ON a.id = r.appointment_id
        WHERE r.kind = 'service' AND r.reviewee_id = p_host AND a.rental_listing_id IS NOT NULL
    ), ls AS (
        SELECT count(*) FILTER (WHERE status = 'rented') AS rented, count(*) FILTER (WHERE status = 'active') AS active,
               bool_or(store_id IS NOT NULL) AS agency, min(created_at) AS since
        FROM public.rental_listings WHERE owner_id = p_host
    )
    SELECT jsonb_build_object(
        'rented_count', ls.rented, 'active_count', ls.active, 'reviews_count', rv.n, 'avg_rating', rv.avg, 'agency', COALESCE(ls.agency, false), 'since', ls.since,
        'badge', CASE WHEN COALESCE(ls.agency, false) THEN 'agency'
                      WHEN ls.rented >= 2 AND rv.n >= 3 AND rv.avg >= 4.5 THEN 'trusted' ELSE NULL END)
    FROM rv, ls;
$$;
REVOKE ALL ON FUNCTION public.get_rental_host_trust(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_rental_host_trust(uuid) TO anon, authenticated;

-- Avaliações públicas do imóvel/anunciante (o que os visitantes disseram depois da visita)
CREATE OR REPLACE FUNCTION public.get_rental_reviews(p_listing uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb) FROM (
        SELECT r.rating, r.comment, r.created_at, pr.name AS reviewer_name, pr."profileSlug" AS reviewer_slug
        FROM public.appointment_reviews r
        JOIN public.appointments a ON a.id = r.appointment_id
        JOIN public.profiles pr ON pr.id = r.reviewer_id
        WHERE r.kind = 'service' AND a.rental_listing_id = p_listing
        ORDER BY r.created_at DESC LIMIT 30) t;
$$;
REVOKE ALL ON FUNCTION public.get_rental_reviews(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_rental_reviews(uuid) TO anon, authenticated;

-- Contagem de visualizações do anúncio (ninguém mexe no contador direto)
CREATE OR REPLACE FUNCTION public.track_rental_view(p_listing uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE public.rental_listings SET view_count = view_count + 1 WHERE id = p_listing AND status = 'active' AND owner_id IS DISTINCT FROM auth.uid();
$$;
REVOKE ALL ON FUNCTION public.track_rental_view(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.track_rental_view(uuid) TO anon, authenticated;
