-- "Visitantes dos serviços": quem viu cada pedido de serviço (igual aos
-- visitantes do perfil, mas por card de pedido). Só o dono do pedido lê a
-- lista; a gravação é feita pela função abaixo (SECURITY DEFINER), que também
-- mantém o view_count em dia e evita contar a mesma pessoa várias vezes
-- seguidas (janela de 30 min).
CREATE TABLE IF NOT EXISTS public.service_request_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
    viewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    anonymous_id UUID,
    device_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_request_visits_request_idx
    ON public.service_request_visits (service_request_id, created_at DESC);

ALTER TABLE public.service_request_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dono do pedido vê os visitantes dele" ON public.service_request_visits FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.service_requests r
        WHERE r.id = service_request_visits.service_request_id AND r.requester_id = auth.uid()
    ));

CREATE OR REPLACE FUNCTION public.track_service_request_view(
    p_request_id UUID,
    p_anonymous_id UUID DEFAULT NULL,
    p_device_type TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_owner UUID;
    v_recent BOOLEAN;
BEGIN
    SELECT requester_id INTO v_owner FROM public.service_requests WHERE id = p_request_id;
    IF NOT FOUND OR v_owner = v_uid THEN
        RETURN FALSE;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.service_request_visits
        WHERE service_request_id = p_request_id
          AND created_at > now() - interval '30 minutes'
          AND (
              (v_uid IS NOT NULL AND viewer_id = v_uid)
              OR (v_uid IS NULL AND p_anonymous_id IS NOT NULL AND anonymous_id = p_anonymous_id)
          )
    ) INTO v_recent;
    IF v_recent THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.service_request_visits (service_request_id, viewer_id, anonymous_id, device_type)
    VALUES (p_request_id, v_uid, p_anonymous_id, p_device_type);

    UPDATE public.service_requests SET view_count = view_count + 1 WHERE id = p_request_id;
    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_service_request_view(UUID, UUID, TEXT) TO authenticated, anon;
