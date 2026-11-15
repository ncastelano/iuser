-- Desfaz 20261130000040_store_digital_summary.sql (só tira a função de leitura; nada de dado)
DROP FUNCTION IF EXISTS public.get_store_digital_summary(uuid);
