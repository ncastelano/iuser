-- Taxa extra por tarefas do motorista fora de dirigir (subir no apartamento,
-- espera parada, carregar objeto pesado) — cobrada por faixa de tempo gasto,
-- não por tipo de tarefa. O motorista registra quanto tempo levou e o valor
-- é calculado pela tabela em src/lib/extraTaskFees.ts.
alter table ride_requests
    add column if not exists extra_task_minutes integer,
    add column if not exists extra_task_fee numeric(10, 2),
    add column if not exists extra_task_description text;
