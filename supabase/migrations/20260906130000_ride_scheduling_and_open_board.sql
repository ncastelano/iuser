-- O quadro de /aceitar-corridas escondia o pedido depois de só 2 minutos
-- (applications_close_at), então um motorista que demorasse pra abrir a
-- tela nunca via o pedido, e não dava pra agendar uma corrida pra mais
-- tarde. Agora o pedido fica visível enquanto estiver "pending" — some só
-- quando aceito ou cancelado.
DROP INDEX IF EXISTS public.ride_requests_open_board_idx;
CREATE INDEX IF NOT EXISTS ride_requests_open_board_idx ON public.ride_requests (created_at) WHERE status = 'pending';

ALTER TABLE public.ride_requests DROP COLUMN applications_close_at;

-- Agendamento: null = corrida pra agora. Preenchido = motorista vê e pode
-- aceitar com antecedência pra um horário futuro.
ALTER TABLE public.ride_requests
    ADD COLUMN scheduled_for TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ride_requests_scheduled_idx ON public.ride_requests (scheduled_for) WHERE status = 'pending';
