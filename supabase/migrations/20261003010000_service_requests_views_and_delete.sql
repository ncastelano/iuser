-- /procurar-servico precisa mostrar quantas vezes cada pedido foi visto
-- (view_count), e quem pediu precisa poder apagar o próprio pedido — hoje
-- não existe nem a coluna nem policy nenhuma de DELETE/UPDATE pra requester.
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

CREATE POLICY "Dono apaga seu próprio pedido de serviço" ON public.service_requests FOR DELETE
    USING (auth.uid() = requester_id);

-- Incrementa via função (SECURITY DEFINER) em vez de política de UPDATE
-- aberta: assim quem visualiza o quadro consegue contar a visita sem poder
-- editar o resto do pedido de outra pessoa.
CREATE OR REPLACE FUNCTION public.increment_service_request_view_count(p_request_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_count INTEGER;
BEGIN
    UPDATE public.service_requests
    SET view_count = view_count + 1
    WHERE id = p_request_id
    RETURNING view_count INTO new_count;
    RETURN new_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_service_request_view_count(UUID) TO authenticated, anon;
