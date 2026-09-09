-- Forma de pagamento da corrida — só a escolha e o troco (quando dinheiro),
-- sem nenhuma lógica de confirmação/gate de conclusão por enquanto. Isso é
-- puramente informativo pro motorista saber o que esperar.
alter table ride_requests
    add column if not exists payment_method text
        check (payment_method in ('dinheiro', 'pix')),
    add column if not exists cash_change_for numeric(10, 2);
