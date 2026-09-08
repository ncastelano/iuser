-- Faltava uma policy de SELECT pro motorista ver o próprio pedido depois de
-- aceito: só existiam policies de SELECT por requester_id (dono do pedido) e
-- por status='pending' (quadro aberto). Sem isso, tanto /minhas-corridas
-- quanto a nova aba "Corrida aceita" de /aceitar-corridas vinham vazias pro
-- motorista mesmo com driver_id apontando pra ele — RLS bloqueava a leitura.
CREATE POLICY "Motorista vê a corrida que aceitou" ON public.ride_requests FOR SELECT
    USING (auth.uid() = driver_id);
