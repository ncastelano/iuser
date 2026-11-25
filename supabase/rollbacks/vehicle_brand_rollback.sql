-- Desfaz 20261130000124: remove a marca do veículo.
ALTER TABLE public.driver_vehicles DROP COLUMN IF EXISTS car_brand;
