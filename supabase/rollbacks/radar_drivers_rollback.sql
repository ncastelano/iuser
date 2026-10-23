-- ROLLBACK da migration 20261120000000_radar_drivers.sql
DROP FUNCTION IF EXISTS public.get_radar_drivers(double precision, double precision, double precision);
