-- Liga/desliga explícito do "modo motorista" — separado de ter uma tarifa
-- configurada. Controla se o motorista aparece pronto pra aceitar corridas
-- (mostra "painel do motorista" + "ver corridas" na home) ou só o botão
-- pra ativar (mostra "Ativar modo motorista").
alter table driver_pricing
    add column if not exists driver_mode_active boolean not null default false;
