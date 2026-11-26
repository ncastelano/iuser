-- Zoom do enquadramento da foto do carro: agora também pode DIMINUIR (mínimo 60%); antes o mínimo era 100%.
-- Rollback: supabase/rollbacks/vehicle_photo_zoom_min_rollback.sql
ALTER TABLE public.driver_vehicles DROP CONSTRAINT IF EXISTS driver_vehicles_car_photo_zoom_range;
ALTER TABLE public.driver_vehicles ADD CONSTRAINT driver_vehicles_car_photo_zoom_range CHECK (car_photo_zoom >= 0.6 AND car_photo_zoom <= 3);
