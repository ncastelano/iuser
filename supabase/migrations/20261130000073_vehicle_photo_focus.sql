-- 20261130000073_vehicle_photo_focus.sql
--
-- ENQUADRAMENTO DA FOTO DO VEÍCULO (17/11/2026, decisão do dono): a foto do carro é a capa da página do motorista e muitas vezes aparece
-- cortada no ângulo errado. O motorista toca no ícone de mover e arrasta a foto até enquadrar; guardamos o ponto da foto que fica no centro
-- (0 a 100 em cada eixo, o `object-position` do CSS). Só apresentação; a ficha do carro já é pública e só o dono grava (RLS de sempre).
-- Rollback: supabase/rollbacks/vehicle_photo_focus_rollback.sql.

ALTER TABLE public.driver_vehicles
    ADD COLUMN IF NOT EXISTS car_photo_pos_x smallint NOT NULL DEFAULT 50,
    ADD COLUMN IF NOT EXISTS car_photo_pos_y smallint NOT NULL DEFAULT 50;

DO $$ BEGIN
    ALTER TABLE public.driver_vehicles ADD CONSTRAINT driver_vehicles_photo_pos_check
        CHECK (car_photo_pos_x BETWEEN 0 AND 100 AND car_photo_pos_y BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
