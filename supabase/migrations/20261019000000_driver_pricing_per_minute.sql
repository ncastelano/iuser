-- "Minha tarifa" também pode cobrar por tempo: valor por minuto de corrida,
-- somado à tarifa base + km (null = não cobra por tempo, como era antes).
ALTER TABLE public.driver_pricing
    ADD COLUMN IF NOT EXISTS price_per_minute NUMERIC(8, 2) CHECK (price_per_minute IS NULL OR price_per_minute >= 0);
