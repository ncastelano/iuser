-- Plano "Motorista Beta": só concedido por convite (admin ou líder de
-- motoristas), válido até o fim do ano — não tem coluna de data própria,
-- quem concede calcula os dias até 31/12 e usa o mecanismo de "dias" que
-- já existe pra concessão de plano. is_active=false = não aparece na
-- vitrine normal de /planos (mesmo idioma já usado pro plano "loja").
INSERT INTO public.plans (code, name, price, grants_driver, is_active, description, billing_cycle, features)
VALUES (
    'motorista_beta',
    'Motorista Beta',
    5.00,
    true,
    false,
    'Plano motorista de teste, concedido por convite — válido até o fim do ano.',
    'YEARLY',
    ARRAY['Libera o modo motorista até 31/12', 'Concedido por convite (admin ou líder de motoristas)']
)
ON CONFLICT (code) DO NOTHING;

UPDATE public.plans SET leader_grantable = true WHERE code = 'motorista_beta';
