-- Motorista agora escolhe entre a tarifa padrão da plataforma (valores
-- fixos, definidos no código) ou a tarifa própria dele (os 3 campos que já
-- existiam). Os campos numéricos viram opcionais porque no modo
-- 'platform' eles não são usados/preenchidos.
ALTER TABLE public.driver_pricing
    ALTER COLUMN base_distance_km DROP NOT NULL,
    ALTER COLUMN base_fee DROP NOT NULL,
    ALTER COLUMN price_per_km_after_base DROP NOT NULL,
    ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'custom' CHECK (pricing_mode IN ('platform', 'custom'));

-- Linhas já existentes têm os 3 campos preenchidos e caem em 'custom' pelo
-- default acima, então a constraint abaixo já nasce satisfeita.
ALTER TABLE public.driver_pricing
    ADD CONSTRAINT driver_pricing_custom_fields_check CHECK (
        pricing_mode = 'platform'
        OR (base_distance_km IS NOT NULL AND base_fee IS NOT NULL AND price_per_km_after_base IS NOT NULL)
    );
