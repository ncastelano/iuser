-- Enquadramento da foto do carro: zoom (1 = foto inteira preenchendo o topo; até 3x). O ponto do enquadramento já é car_photo_pos_x/y.
-- Rollback: supabase/rollbacks/vehicle_photo_zoom_rollback.sql
ALTER TABLE public.driver_vehicles
    ADD COLUMN IF NOT EXISTS car_photo_zoom numeric(3,2) NOT NULL DEFAULT 1
    CONSTRAINT driver_vehicles_car_photo_zoom_range CHECK (car_photo_zoom >= 1 AND car_photo_zoom <= 3);
