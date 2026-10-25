-- Lançamento da interface 3.0: liberada para TODOS (feature_flags.ui_v3 = "liberada para todos"; o padrão continua v2, cada pessoa escolhe
-- em "Ir para a v3" e a escolha fica salva no perfil). Desligar de novo: UPDATE public.feature_flags SET enabled = false WHERE key = 'ui_v3'
-- (ou Admin → Versão da interface). Só muda dado; nenhuma estrutura.
INSERT INTO public.feature_flags (key, enabled) VALUES ('ui_v3', true)
ON CONFLICT (key) DO UPDATE SET enabled = true, updated_at = now();
