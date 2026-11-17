-- 20261130000071_profile_type.sql
--
-- TIPO DO PERFIL (decisão do dono, 17/11/2026: "como os temas de lojas, agora os temas de perfis"). Igual ao modelo da loja (`stores.store_model`):
-- muda só a APRESENTAÇÃO da página pública do perfil — o botão principal e o que aparece primeiro. Nenhuma permissão, preço ou regra depende dele.
--   pessoal      = o perfil social de sempre (publicações primeiro, Seguir e Enviar mensagem)   ← PADRÃO
--   servicos     = quem presta serviço (serviços primeiro, botão "Contratar")
--   agendamentos = quem atende com hora marcada (botão "Agendar" e os horários livres)
--   motorista    = quem dirige pelo iUser (botão "Solicitar corrida", já com o valor da tarifa DELE)
-- A pessoa escolhe no cadastro e troca no painel do perfil. É dado público da página do perfil: entra nas três listas de colunas públicas
-- (esta migration, src/lib/publicColumns.ts e scripts/test-security-exposure.mjs). Quem já tem conta recebe o tipo que o uso indica.
-- Rollback: supabase/rollbacks/profile_type_rollback.sql. Cenários: supabase/tests/profile_type_scenarios.sql.

DO $$
DECLARE
    type_cols text[] := ARRAY['profile_type'];
    cols text;
BEGIN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS profile_type text NOT NULL DEFAULT 'pessoal';
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_profile_type_check;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_profile_type_check CHECK (profile_type IN ('pessoal', 'servicos', 'agendamentos', 'motorista'));
    SELECT string_agg(quote_ident(x), ', ') INTO cols FROM unnest(type_cols) x;
    EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon, authenticated', cols);
    EXECUTE format('GRANT INSERT (%s) ON public.profiles TO authenticated', cols);
    EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', cols);
END $$;

-- Quem já existe: o que a pessoa já faz decide (motorista com veículo > agenda ligada > serviço publicado > pessoal). Só mexe em quem ainda está no padrão.
UPDATE public.profiles p SET profile_type = CASE
    WHEN EXISTS (SELECT 1 FROM public.driver_vehicles v WHERE v.driver_id = p.id) THEN 'motorista'
    WHEN COALESCE(p.allow_scheduling, false) THEN 'agendamentos'
    WHEN EXISTS (SELECT 1 FROM public.products pr WHERE pr.owner_id = p.id AND pr.store_id IS NULL AND pr.listing_type = 'service_offer' AND COALESCE(pr.is_active, true)) THEN 'servicos'
    ELSE 'pessoal' END
WHERE p.profile_type = 'pessoal';
