-- Marca do veículo (além do modelo e da placa). Coluna pública, como as outras da ficha do carro.
-- Rollback: supabase/rollbacks/vehicle_brand_rollback.sql
ALTER TABLE public.driver_vehicles
    ADD COLUMN IF NOT EXISTS car_brand text
    CONSTRAINT driver_vehicles_car_brand_len CHECK (car_brand IS NULL OR length(car_brand) <= 40);
