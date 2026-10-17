-- Etapa 1.5 / Grupo A (fechamento): corridas pendentes deixam de ser legíveis por visitante e por qualquer logado.
-- Só roda depois da 20261085 (ride_offers) e do app que lê ride_offers estar no ar.
-- Fecha a leitura pública das corridas pendentes.
DROP POLICY IF EXISTS "Visitantes veem pedidos de motorista abertos" ON public.ride_requests;
DROP POLICY IF EXISTS "Autenticados veem pedidos de motorista abertos" ON public.ride_requests;

-- Menor privilégio: visitante sem login não tem acesso nenhum a essas tabelas; ninguém precisa de TRUNCATE/REFERENCES/TRIGGER.
REVOKE ALL ON public.ride_requests, public.ride_applications FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.ride_requests, public.ride_applications FROM authenticated;
