-- Complemento livre do endereço (ex: "casa amarela, portão de ferro, perto do
-- mercado X") — diferente do origin/destination_access_notes, que só existe
-- quando o local é um condomínio fechado. Este campo serve pra qualquer
-- endereço, pra ajudar o motorista a achar o local de partida/chegada.
alter table ride_requests
    add column if not exists origin_complement text,
    add column if not exists destination_complement text;
