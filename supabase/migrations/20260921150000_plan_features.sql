-- Cada card de /planos passa a listar benefícios concretos (não só uma
-- frase única) — começando pelo motorista, que serve de modelo pros
-- demais: preço sob seu controle, liberdade de escolher cliente, e taxa 0%
-- (o modelo de negócio é 100% mensalidade, nunca comissão por corrida/
-- serviço/venda — por isso "taxa 0%" vale pros 3 igualmente).
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS features TEXT[];

UPDATE public.plans SET features = ARRAY[
    'Você define o preço da corrida — use a tabela da plataforma ou o seu próprio valor',
    'Escolha seus clientes: aceite só as corridas que quiser',
    'Receba 100% do valor das corridas — taxa 0%'
] WHERE code = 'motorista';

UPDATE public.plans SET features = ARRAY[
    'Veja o quadro de pedidos de serviço abertos e se candidate aos que quiser',
    'Escolha seus clientes: você decide a quem atender',
    'Receba 100% do valor do serviço — taxa 0%'
] WHERE code = 'prestador';

UPDATE public.plans SET features = ARRAY[
    'Adicione quantos produtos quiser e apareça pros compradores',
    'Você define o preço de cada produto',
    'Receba 100% do valor das vendas — taxa 0%'
] WHERE code = 'loja';

UPDATE public.plans SET features = ARRAY[
    'Indique pessoas pra plataforma e ganhe comissão quando elas assinarem um plano',
    'Acompanhe seus indicados e sua comissão direto na carteira',
    'Sem limite de indicações'
] WHERE code = 'recrutador';

UPDATE public.plans SET features = ARRAY[
    'Tudo junto: motorista + prestador + loja + recrutador',
    'Um único valor mensal, mais barato que assinar os 4 separados',
    'Ideal pra quem quer usar a plataforma em todas as frentes'
] WHERE code = 'combo';
