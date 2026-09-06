-- Detalha a criança informada em "Mais alguém vai?": idade e se precisa de
-- cadeirinha, pra descrever o pedido de forma completa na tela de
-- confirmação (em vez de só contar como "+1 pessoa").
ALTER TABLE public.ride_requests
    ADD COLUMN child_age INT CHECK (child_age >= 0 AND child_age <= 17),
    ADD COLUMN child_needs_car_seat BOOLEAN;
