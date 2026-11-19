-- Rollback de 20261130000077_order_tracking.sql: o cliente deixa de ver onde está o entregador.
DROP FUNCTION IF EXISTS public.get_order_tracking(uuid);
