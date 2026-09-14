-- Marca o momento em que o motorista inicia a corrida (embarcou o passageiro
-- e começou a rodar rumo ao destino) — estado intermediário entre "chegou ao
-- ponto de partida" (driver_arrived_at) e "concluída" (status='completed').
alter table ride_requests
    add column if not exists ride_started_at timestamptz;
