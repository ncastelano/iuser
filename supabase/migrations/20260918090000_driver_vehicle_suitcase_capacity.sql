-- supabase/migrations/20260918090000_driver_vehicle_suitcase_capacity.sql
--
-- Além das sacolas de compras (trunk_bags_*), o porta-malas também tem
-- capacidade pra malas de viagem (pequena/média/grande) - categoria
-- diferente, tamanho físico diferente.

alter table public.driver_vehicles
    add column if not exists trunk_suitcases_pequena integer,
    add column if not exists trunk_suitcases_media integer,
    add column if not exists trunk_suitcases_grande integer;
