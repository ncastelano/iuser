-- Desfaz 20261130000119: remove a contagem de pessoas (a página volta a usar stores.view_count).
DROP FUNCTION IF EXISTS public.get_store_visitor_count(uuid);
