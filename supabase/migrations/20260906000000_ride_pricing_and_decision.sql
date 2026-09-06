-- Adiciona os dados que faltavam pro fluxo de aceite de corrida: coordenadas
-- e distância/duração da rota (pra calcular o preço sugerido por motorista),
-- janela de candidatura e qual motorista acabou sendo escolhido.
ALTER TABLE public.ride_requests
    ADD COLUMN origin_lat DOUBLE PRECISION,
    ADD COLUMN origin_lng DOUBLE PRECISION,
    ADD COLUMN destination_lat DOUBLE PRECISION,
    ADD COLUMN destination_lng DOUBLE PRECISION,
    ADD COLUMN distance_km NUMERIC,
    ADD COLUMN duration_min NUMERIC,
    ADD COLUMN applications_close_at TIMESTAMPTZ,
    ADD COLUMN driver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ride_requests_driver_idx ON public.ride_requests (driver_id);
-- /aceitar-corridas só lista status = pending dentro da janela; índice
-- parcial cobre exatamente essa consulta.
CREATE INDEX IF NOT EXISTS ride_requests_open_board_idx ON public.ride_requests (applications_close_at) WHERE status = 'pending';

-- Contraproposta do motorista: preço que ele oferece ao se candidatar
-- (aceitando o valor sugerido, ou um valor diferente). Nullable porque
-- candidaturas antigas (do fluxo genérico de /procurar-servico) não tinham
-- preço.
ALTER TABLE public.ride_applications
    ADD COLUMN proposed_price NUMERIC CHECK (proposed_price > 0);

-- ride_requests não tinha NENHUMA policy de UPDATE até agora — nem o
-- próprio dono conseguia mudar o status. Duas policies novas, pra dois
-- atores diferentes:
CREATE POLICY "Dono atualiza status e motorista do próprio pedido" ON public.ride_requests FOR UPDATE
    USING (auth.uid() = requester_id)
    WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Motorista aceito finaliza a corrida" ON public.ride_requests FOR UPDATE
    USING (auth.uid() = driver_id)
    WITH CHECK (auth.uid() = driver_id AND status IN ('accepted', 'completed'));
