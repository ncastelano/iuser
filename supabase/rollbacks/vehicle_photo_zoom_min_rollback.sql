-- Desfaz 20261130000127: o zoom volta a ter mínimo de 100%.
UPDATE public.driver_vehicles SET car_photo_zoom = 1 WHERE car_photo_zoom < 1;
ALTER TABLE public.driver_vehicles DROP CONSTRAINT IF EXISTS driver_vehicles_car_photo_zoom_range;
ALTER TABLE public.driver_vehicles ADD CONSTRAINT driver_vehicles_car_photo_zoom_range CHECK (car_photo_zoom >= 1 AND car_photo_zoom <= 3);
