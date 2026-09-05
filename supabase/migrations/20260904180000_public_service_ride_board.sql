-- /procurar-servico deve mostrar os pedidos abertos para qualquer visitante,
-- não só para quem está logado (login só é exigido para se candidatar).
-- As policies existentes restringem o SELECT a "authenticated"; adicionamos
-- a mesma leitura para "anon" sem alterar as policies já criadas.
CREATE POLICY "Visitantes veem pedidos de serviço abertos" ON public.service_requests
    FOR SELECT TO anon USING (status = 'pending');

CREATE POLICY "Visitantes veem pedidos de motorista abertos" ON public.ride_requests
    FOR SELECT TO anon USING (status = 'pending');
