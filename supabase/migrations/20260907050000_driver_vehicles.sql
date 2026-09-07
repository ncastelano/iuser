-- Ficha do carro do motorista (modelo, cor, placa, foto) e quais serviços
-- ele oferece (ar-condicionado, wi-fi etc.) — diferente de driver_pricing
-- (que é privado, só o motorista vê sua tarifa), essa ficha é pública:
-- o passageiro precisa ver isso pra escolher entre os candidatos e
-- reconhecer o carro na rua.
CREATE TABLE IF NOT EXISTS public.driver_vehicles (
    driver_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    car_model TEXT,
    car_color TEXT,
    car_plate TEXT,
    car_photo_url TEXT,
    services TEXT[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.driver_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ficha do carro é pública" ON public.driver_vehicles FOR SELECT USING (true);
CREATE POLICY "Motorista cria a ficha do seu carro" ON public.driver_vehicles FOR INSERT WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "Motorista atualiza a ficha do seu carro" ON public.driver_vehicles FOR UPDATE
    USING (auth.uid() = driver_id) WITH CHECK (auth.uid() = driver_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-car-photos', 'driver-car-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Driver Car Photos Public Read" ON storage.objects FOR SELECT
    USING (bucket_id = 'driver-car-photos');
CREATE POLICY "Driver Car Photos Authenticated Upload" ON storage.objects FOR INSERT
    TO authenticated WITH CHECK (bucket_id = 'driver-car-photos');
CREATE POLICY "Driver Car Photos Owner Update" ON storage.objects FOR UPDATE
    TO authenticated USING (bucket_id = 'driver-car-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Driver Car Photos Owner Delete" ON storage.objects FOR DELETE
    TO authenticated USING (bucket_id = 'driver-car-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
