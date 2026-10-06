-- 1) Quem fez o pedido de serviço pode editá-lo (descrição, condomínio etc).
--    Antes só existiam policies de SELECT/INSERT/DELETE — o UPDATE do dono
--    era negado pelo RLS. Candidatos continuam sem poder editar o pedido dos
--    outros (a contagem de visitas segue pela função SECURITY DEFINER).
CREATE POLICY "Dono edita seu próprio pedido de serviço" ON public.service_requests FOR UPDATE
    USING (auth.uid() = requester_id)
    WITH CHECK (auth.uid() = requester_id);

-- 2) Contagem de visualizações da página de um serviço/produto/publicação por
--    visitantes (incluindo anônimos), sem abrir UPDATE de products pra todos.
CREATE OR REPLACE FUNCTION public.increment_product_view_count(p_product_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_count INTEGER;
BEGIN
    UPDATE public.products
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE id = p_product_id
    RETURNING view_count INTO new_count;
    RETURN new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_product_view_count(UUID) TO authenticated, anon;
