-- Tarifa da plataforma num lugar só: antes os valores (base, km, minuto e extras)
-- viviam fixos no código (driverPricing.ts); agora o administrador geral ajusta
-- tudo em Admin → Tarifas, por tipo de veículo. Todo mundo lê (a tarifa aparece
-- pro motorista e entra nos cálculos); só a service role (rota /api/admin/*)
-- escreve. Os valores abaixo são exatamente os que já estavam no código.
CREATE TABLE IF NOT EXISTS public.platform_tariffs (
    vehicle_kind TEXT PRIMARY KEY CHECK (vehicle_kind IN ('carro', 'moto', 'bicicleta')),
    base_distance_km NUMERIC(8, 2) NOT NULL CHECK (base_distance_km >= 0),
    base_fee NUMERIC(8, 2) NOT NULL CHECK (base_fee >= 0),
    price_per_km NUMERIC(8, 2) NOT NULL CHECK (price_per_km >= 0),
    price_per_minute NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (price_per_minute >= 0),
    extra_fee_pessoa NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (extra_fee_pessoa >= 0),
    extra_fee_animal NUMERIC(8, 2) NOT NULL DEFAULT 5 CHECK (extra_fee_animal >= 0),
    extra_fee_objeto NUMERIC(8, 2) NOT NULL DEFAULT 3 CHECK (extra_fee_objeto >= 0),
    fee_condominio NUMERIC(8, 2) NOT NULL DEFAULT 1 CHECK (fee_condominio >= 0),
    fee_compras NUMERIC(8, 2) NOT NULL DEFAULT 1 CHECK (fee_compras >= 0),
    fee_necessidade_especial NUMERIC(8, 2) NOT NULL DEFAULT 1 CHECK (fee_necessidade_especial >= 0),
    fee_pet_sem_caixa NUMERIC(8, 2) NOT NULL DEFAULT 1 CHECK (fee_pet_sem_caixa >= 0),
    fee_entrega_interna NUMERIC(8, 2) NOT NULL DEFAULT 1 CHECK (fee_entrega_interna >= 0),
    fee_ar_condicionado NUMERIC(8, 2) NOT NULL DEFAULT 1 CHECK (fee_ar_condicionado >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_tariffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos leem a tarifa da plataforma" ON public.platform_tariffs
    FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.platform_tariffs (vehicle_kind, base_distance_km, base_fee, price_per_km, price_per_minute) VALUES
    ('carro', 5, 7, 2, 0.30),
    ('moto', 5, 5, 1.5, 0.20),
    ('bicicleta', 5, 5, 1.5, 0.20)
ON CONFLICT (vehicle_kind) DO NOTHING;
