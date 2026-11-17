-- Rollback de 20261130000073_vehicle_photo_focus.sql
ALTER TABLE public.driver_vehicles DROP CONSTRAINT IF EXISTS driver_vehicles_photo_pos_check;
ALTER TABLE public.driver_vehicles DROP COLUMN IF EXISTS car_photo_pos_x, DROP COLUMN IF EXISTS car_photo_pos_y;
