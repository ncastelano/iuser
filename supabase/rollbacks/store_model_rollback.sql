-- Desfaz 20261114000000_store_model.sql
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_store_model_check;
ALTER TABLE public.stores DROP COLUMN IF EXISTS store_model;
