-- Canal do motorista deixa de ser só carro: motorista cadastra o tipo do
-- próprio veículo (driver_vehicles.vehicle_kind) e o pedido de corrida
-- passa a aceitar moto/bicicleta além de carro/van/van-grande.
-- Reaproveita car_model/car_plate/car_color/car_photo_url como campos
-- genéricos de "identidade do veículo" pra qualquer tipo (moto também tem
-- modelo/placa/cor/foto) — não renomeamos essas colunas.
ALTER TABLE public.driver_vehicles
    ADD COLUMN IF NOT EXISTS vehicle_kind TEXT NOT NULL DEFAULT 'carro'
        CHECK (vehicle_kind IN ('carro', 'moto', 'bicicleta'));

ALTER TABLE public.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_vehicle_type_check;
ALTER TABLE public.ride_requests ADD CONSTRAINT ride_requests_vehicle_type_check
    CHECK (vehicle_type IN ('carro', 'van', 'van-grande', 'moto', 'bicicleta'));
