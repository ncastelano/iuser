-- Os planos concedíveis mudaram (motorista/prestador/loja/recrutador/combo
-- viraram um só, pre_pago) — atualiza o que cada permissão libera.
--
-- pre_pago junta tudo que motorista+prestador+loja+recrutador+combo davam
-- juntos, então mapeia pra grant_combo_plan (a permissão que já exigia o
-- nível mais alto — gestor/administrador) em vez de grant_driver_plan (que
-- líder também tem): manter no nível de combo evita que líder/supervisor
-- passem a conceder de graça um pacote maior do que podiam antes só porque
-- os planos foram consolidados num só.
UPDATE public.plans SET grantable = false, grant_permission = NULL
    WHERE code IN ('motorista', 'prestador', 'loja', 'recrutador', 'combo', 'motorista_beta', 'beta');

UPDATE public.plans SET grantable = true, grant_permission = 'grant_combo_plan'
    WHERE code = 'pre_pago';

-- Pós-pago continua de fora (mesma razão de sempre: a ativação exige
-- CPF/aparelho únicos, que o caminho de concessão gratuita não passa por).

-- Rótulo da permissão não faz mais sentido chamado de "Combo".
UPDATE public.permissions SET name = 'Conceder Pré-pago' WHERE slug = 'grant_combo_plan';
