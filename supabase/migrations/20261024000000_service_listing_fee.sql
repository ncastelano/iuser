-- Publicar um serviço (perfil ou loja) passa a ter taxa PRÓPRIA no pós-pago: "Serviço
-- publicado", R$ 0,50 por padrão e editável no Admin → Planos → preço por serviço.
-- Antes um serviço publicado (products.listing_type = 'service_offer') caía no mesmo
-- balde do "Produto cadastrado" (product_fee), sem aparecer como serviço nos planos
-- nem no extrato. Pré-pago e o brinde de 90 dias seguem sem taxa nenhuma
-- (is_postpaid_user() é falso nesses casos).

-- 1) Novo tipo de cobrança no extrato
ALTER TABLE public.driver_postpaid_charges DROP CONSTRAINT IF EXISTS driver_postpaid_charges_type_check;
ALTER TABLE public.driver_postpaid_charges ADD CONSTRAINT driver_postpaid_charges_type_check
    CHECK (type IN ('ride_fee', 'service_fee', 'order_fee', 'in_person_fee', 'product_fee', 'publication_fee',
                    'service_listing_fee', 'schedule_activation_fee', 'appointment_fee', 'whatsapp_bot_message_fee', 'payment'));

-- Uma cobrança por serviço publicado (não duplica se o trigger rodar de novo)
CREATE UNIQUE INDEX IF NOT EXISTS driver_postpaid_service_listing_dedupe_idx
    ON public.driver_postpaid_charges (product_id) WHERE type = 'service_listing_fee';

-- 2) Preço editável (mesma tabela dos demais serviços do pós-pago)
ALTER TABLE public.service_pricing DROP CONSTRAINT IF EXISTS service_pricing_service_type_check;
ALTER TABLE public.service_pricing ADD CONSTRAINT service_pricing_service_type_check
    CHECK (service_type IN (
        'ride_fee', 'service_fee', 'order_fee', 'in_person_fee',
        'product_fee', 'publication_fee', 'service_listing_fee', 'schedule_activation_fee', 'appointment_fee',
        'whatsapp_bot_message_fee'
    ));

INSERT INTO public.service_pricing (service_type, label, base_price, postpaid_price)
VALUES ('service_listing_fee', 'Serviço publicado (perfil ou loja)', 0.50, 0.50)
ON CONFLICT (service_type) DO NOTHING;

-- 3) Trigger: produto / publicação / SERVIÇO novo, cada um com a sua taxa.
--    ON CONFLICT sem alvo pra valer pros três índices únicos de product_id.
CREATE OR REPLACE FUNCTION public.accrue_postpaid_product_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_owner uuid;
    v_type text;
BEGIN
    IF NEW.store_id IS NOT NULL THEN
        SELECT owner_id INTO v_owner FROM public.stores WHERE id = NEW.store_id;
    ELSE
        v_owner := NEW.owner_id;
    END IF;

    v_type := CASE NEW.listing_type
        WHEN 'publication' THEN 'publication_fee'
        WHEN 'service_offer' THEN 'service_listing_fee'
        ELSE 'product_fee'
    END;

    IF v_owner IS NOT NULL AND public.is_postpaid_user(v_owner) THEN
        INSERT INTO public.driver_postpaid_charges (driver_id, product_id, type, amount)
        VALUES (v_owner, NEW.id, v_type,
                COALESCE((SELECT postpaid_price FROM public.service_pricing WHERE service_type = v_type), 0.50))
        ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
END; $$;
