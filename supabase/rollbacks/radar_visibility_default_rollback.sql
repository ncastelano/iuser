-- ROLLBACK da migration 20261121000000_radar_visibility_default.sql (volta o padrão antigo: aparecer no mapa)
ALTER TABLE public.profiles ALTER COLUMN show_on_map SET DEFAULT true;
