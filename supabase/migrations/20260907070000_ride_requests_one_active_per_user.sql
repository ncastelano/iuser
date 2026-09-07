-- Um passageiro só pode ter um pedido de corrida ativo (pending ou accepted)
-- por vez. Sem essa trava, um duplo clique ou reenvio criava vários pedidos
-- pending pro mesmo requester_id, que ficavam "fantasmas" no quadro de
-- /aceitar-corridas sem que /pedir-motorista soubesse deles (a tela só
-- acompanha o pedido pending/accepted mais recente).
CREATE UNIQUE INDEX IF NOT EXISTS ride_requests_one_active_per_requester
    ON public.ride_requests (requester_id)
    WHERE status IN ('pending', 'accepted');
