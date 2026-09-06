-- Tarifa própria de cada motorista parceiro — mesmo modelo de "tarifa com
-- valor base" que as lojas já usam pra entrega por distância (delivery_type
-- = 'distance' em public.stores), numa tabela própria porque não existe
-- hoje um cadastro de "motorista", só profiles.
CREATE TABLE IF NOT EXISTS public.driver_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    base_distance_km NUMERIC NOT NULL CHECK (base_distance_km >= 0),
    base_fee NUMERIC NOT NULL CHECK (base_fee >= 0),
    price_per_km_after_base NUMERIC NOT NULL CHECK (price_per_km_after_base >= 0),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.driver_pricing ENABLE ROW LEVEL SECURITY;

-- Privado: só o próprio motorista lê sua tarifa. O preço sugerido é
-- calculado no cliente de quem está vendo a corrida (o motorista), então só
-- o valor resultante (proposed_price) precisa ser compartilhado.
CREATE POLICY "Motorista vê sua própria tarifa" ON public.driver_pricing FOR SELECT USING (auth.uid() = driver_id);
CREATE POLICY "Motorista cria sua própria tarifa" ON public.driver_pricing FOR INSERT WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Motorista atualiza sua própria tarifa" ON public.driver_pricing FOR UPDATE
    USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);
