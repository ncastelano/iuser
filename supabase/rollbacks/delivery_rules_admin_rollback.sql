-- Rollback de 20261130000078_delivery_rules_admin.sql: os prazos e limites voltam a mudar só por SQL (os valores ficam como estão).
DROP FUNCTION IF EXISTS public.admin_update_delivery_rules(text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.admin_get_delivery_rules();
DROP FUNCTION IF EXISTS public._delivery_rules_table(text);
