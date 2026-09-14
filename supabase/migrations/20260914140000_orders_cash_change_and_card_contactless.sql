-- Igual ao que já existe pra corridas: quando o pagamento é em dinheiro, a
-- pessoa pode informar troco; quando é em cartão, precisa dizer se é por
-- aproximação (contactless) ou não, pra loja saber que máquina levar/usar.
alter table orders
    add column if not exists cash_change_for numeric,
    add column if not exists card_is_contactless boolean;
