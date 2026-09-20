-- Um motorista pode ter mais de um veículo cadastrado (carro, moto e
-- bicicleta), cada um independente: uma linha por (motorista, tipo).
ALTER TABLE public.driver_vehicles DROP CONSTRAINT IF EXISTS driver_vehicles_pkey;
ALTER TABLE public.driver_vehicles ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.driver_vehicles ADD PRIMARY KEY (id);
ALTER TABLE public.driver_vehicles DROP CONSTRAINT IF EXISTS driver_vehicles_driver_kind_key;
ALTER TABLE public.driver_vehicles ADD CONSTRAINT driver_vehicles_driver_kind_key UNIQUE (driver_id, vehicle_kind);
