-- Registra quem cancelou (passageiro ou motorista) pra poder aplicar a regra
-- de "o motorista só pode recusar 1 vez a cada 10 corridas concluídas dele" —
-- sem isso não dá pra distinguir um cancelamento do motorista de um
-- cancelamento do próprio passageiro.
ALTER TABLE public.ride_requests
    ADD COLUMN cancelled_by TEXT CHECK (cancelled_by IN ('requester', 'driver'));

-- A policy anterior só deixava o motorista aceito levar o pedido pra
-- "accepted" ou "completed" — ele não conseguia cancelar (recusar sair da
-- corrida) depois de aceito. Agora também pode, com 'cancelled'.
DROP POLICY "Motorista aceito finaliza a corrida" ON public.ride_requests;
CREATE POLICY "Motorista aceito finaliza ou cancela a corrida" ON public.ride_requests FOR UPDATE
    USING (auth.uid() = driver_id)
    WITH CHECK (auth.uid() = driver_id AND status IN ('accepted', 'completed', 'cancelled'));
