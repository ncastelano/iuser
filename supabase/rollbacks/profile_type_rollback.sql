-- Rollback de 20261130000071_profile_type.sql: tira o tipo do perfil (a página volta a ser a mesma para todos).
REVOKE SELECT (profile_type), INSERT (profile_type), UPDATE (profile_type) ON public.profiles FROM anon, authenticated;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_profile_type_check;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS profile_type;
