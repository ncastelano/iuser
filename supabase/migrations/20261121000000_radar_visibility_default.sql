-- "Visível no Radar" passa a ser OPT-IN: quem entra no iUser NÃO aparece no mapa do Radar (nem como pessoa, nem com os serviços do perfil)
-- até escolher aparecer — na 1ª etapa de "Definir localização" ou em Painel do perfil → Visível no Radar. Só muda o PADRÃO das contas novas;
-- quem já tem a coluna gravada (true ou false) continua como está, nada é apagado nem ligado/desligado em massa.
ALTER TABLE public.profiles ALTER COLUMN show_on_map SET DEFAULT false;
