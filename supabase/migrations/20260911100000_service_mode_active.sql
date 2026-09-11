-- Mesmo padrão do driver_pricing.driver_mode_active, agora pro prestador de
-- serviço (pintor, encanador, jardineiro...) — sem tarifa pra configurar
-- (ele só se candidata aos serviços abertos em /procurar-servico), então o
-- flag mora direto em profiles em vez de uma tabela de tarifa própria.
alter table profiles
    add column if not exists service_mode_active boolean not null default false;
