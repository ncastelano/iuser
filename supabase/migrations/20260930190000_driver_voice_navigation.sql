-- Orientação por voz pro motorista durante a corrida (liga por padrão; ele
-- pode desligar no painel, igual ao som do alerta de corrida nova).
ALTER TABLE public.driver_pricing ADD COLUMN IF NOT EXISTS voice_navigation_enabled BOOLEAN NOT NULL DEFAULT true;
