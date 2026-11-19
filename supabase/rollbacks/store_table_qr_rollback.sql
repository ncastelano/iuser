-- Desfaz 20261130000086_store_table_qr.sql
DROP FUNCTION IF EXISTS public.get_store_qr_stats(uuid);
DROP FUNCTION IF EXISTS public.record_qr_scan(uuid, int);
DROP TABLE IF EXISTS public.store_qr_scans;
