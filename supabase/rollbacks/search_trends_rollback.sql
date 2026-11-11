-- Desfaz 20261130000036_search_trends.sql (apaga o histórico de buscas registrado)
DROP FUNCTION IF EXISTS public.get_search_trends(text, integer);
DROP FUNCTION IF EXISTS public.clear_my_searches();
DROP FUNCTION IF EXISTS public.log_search(text);
DROP FUNCTION IF EXISTS public._uf_name(text);
DROP FUNCTION IF EXISTS public._search_place(uuid);
DROP FUNCTION IF EXISTS public._search_norm(text);
DROP TABLE IF EXISTS public.search_blocked_terms;
DROP TABLE IF EXISTS public.search_events;
