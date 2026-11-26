-- Desfaz 20261130000126: remove o zoom do enquadramento da foto.
ALTER TABLE public.driver_vehicles DROP COLUMN IF EXISTS car_photo_zoom;
