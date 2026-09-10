-- Adiciona "cartão" como forma de pagamento da corrida, junto de dinheiro/pix
-- (ver 20260909160000_ride_payment_method.sql).
alter table ride_requests
    drop constraint if exists ride_requests_payment_method_check,
    add constraint ride_requests_payment_method_check
        check (payment_method in ('dinheiro', 'pix', 'cartao'));
