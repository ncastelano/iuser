-- Brinde de teste grátis do Pré-pago: agora configurável pelo admin (ligar/desligar e
-- quantos dias dura). Uma linha só; qualquer um lê (os cards mostram "N dias grátis"),
-- só o service role (rota /api/admin/free-trial/settings) escreve.
CREATE TABLE IF NOT EXISTS public.free_trial_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled BOOLEAN NOT NULL DEFAULT true,
    duration_days INT NOT NULL DEFAULT 90 CHECK (duration_days BETWEEN 1 AND 3650),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.free_trial_settings (id, enabled, duration_days)
VALUES (1, true, 90)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.free_trial_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos leem a configuração do brinde" ON public.free_trial_settings
    FOR SELECT USING (true);
