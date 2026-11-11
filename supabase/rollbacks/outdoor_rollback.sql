-- Desfaz 20261130000035_outdoor.sql
DROP FUNCTION IF EXISTS public.get_outdoor_rules(text);
DROP FUNCTION IF EXISTS public.get_outdoor(text, integer);
DROP FUNCTION IF EXISTS public._outdoor_scores(text);
DROP FUNCTION IF EXISTS public._outdoor_w(text, text);
DROP TABLE IF EXISTS public.outdoor_rules;
