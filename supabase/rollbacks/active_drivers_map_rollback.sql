-- ROLLBACK da migration 20261108000000_active_drivers_map.sql
DROP FUNCTION IF EXISTS public.get_active_drivers_map(double precision, double precision, double precision);
