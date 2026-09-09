-- Marca o momento em que o motorista efetivamente chegou ao ponto de
-- partida — hoje só existia "a caminho" (driver_en_route/driver_departed_at)
-- e "concluída", sem nenhum estado intermediário de chegada.
alter table ride_requests
    add column if not exists driver_arrived_at timestamptz;
