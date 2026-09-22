-- Pedido de corrida pode ser aberto pra "qualquer" veículo (carro, moto ou
-- bicicleta) — assim qualquer motorista cadastrado, não só quem tem o
-- veículo exato escolhido, pode se candidatar.
ALTER TABLE public.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_vehicle_type_check;
ALTER TABLE public.ride_requests ADD CONSTRAINT ride_requests_vehicle_type_check
    CHECK (vehicle_type IN ('carro', 'van', 'van-grande', 'moto', 'bicicleta', 'qualquer'));
