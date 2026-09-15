-- supabase/migrations/20260917090000_driver_vehicle_capacity.sql
--
-- Capacidade do carro do motorista - quantos passageiros cabem, se tem
-- banco para bebê, e quantas sacolas de compras (por tamanho) cabem no
-- porta-malas. Fica em driver_vehicles porque, igual o resto dessa ficha,
-- é informação pública que ajuda o passageiro a escolher entre candidatos.

alter table public.driver_vehicles
    add column if not exists passenger_capacity integer,
    add column if not exists has_baby_seat boolean,
    add column if not exists trunk_bags_pequena integer,
    add column if not exists trunk_bags_media integer,
    add column if not exists trunk_bags_grande integer;
