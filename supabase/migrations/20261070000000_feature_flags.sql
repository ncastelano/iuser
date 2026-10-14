-- Chaves liga/desliga da plataforma, controladas pelo administrador. Qualquer um lê (a tela decide se mostra);
-- só o administrador escreve (pela rota /api/admin/feature-flags, que usa a chave de serviço).
CREATE TABLE IF NOT EXISTS public.feature_flags (
    key text PRIMARY KEY,
    enabled boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Todos leem as chaves" ON public.feature_flags;
CREATE POLICY "Todos leem as chaves" ON public.feature_flags FOR SELECT TO anon, authenticated USING (true);

-- Atendimento automático por WhatsApp nas lojas: escondido por padrão (o admin liga quando quiser oferecer)
INSERT INTO public.feature_flags (key, enabled) VALUES ('store_whatsapp_bot', false) ON CONFLICT (key) DO NOTHING;
