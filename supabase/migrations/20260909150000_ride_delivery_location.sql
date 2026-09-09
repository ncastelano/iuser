-- Local de entrega estruturado pra corridas de objeto — antes só existia um
-- toggle genérico "precisa de acesso" com nota livre; agora, quando
-- ride_type = 'objeto', o passageiro escolhe exatamente onde a entrega deve
-- ser feita.
alter table ride_requests
    add column if not exists delivery_location text
        check (delivery_location in ('portaria', 'area_interna', 'apartamento'));
