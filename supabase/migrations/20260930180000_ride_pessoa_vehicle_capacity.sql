-- Corrida de pessoa com mais de 1 passageiro não cabe em moto nem bicicleta
-- (nem em "qualquer", que pode cair pra um motorista de moto/bicicleta) —
-- só carro/van/van-grande têm banco pra mais de uma pessoa. O app já
-- respeita isso ao montar o pedido; esta trava é no banco, pra valer também
-- pra qualquer inserção que não passe pela tela (admin, script, API).

-- Ajusta dados que já existissem em desacordo, antes de travar (nenhuma
-- linha viola isso hoje, mas a migração fica segura mesmo se um dia houver).
UPDATE public.ride_requests
SET vehicle_type = 'carro'
WHERE ride_type = 'pessoa' AND passenger_count > 1 AND vehicle_type IN ('moto', 'bicicleta', 'qualquer');

ALTER TABLE public.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_pessoa_capacity_check;
ALTER TABLE public.ride_requests ADD CONSTRAINT ride_requests_pessoa_capacity_check
    CHECK (
        ride_type <> 'pessoa'
        OR passenger_count <= 1
        OR vehicle_type IN ('carro', 'van', 'van-grande')
    );
