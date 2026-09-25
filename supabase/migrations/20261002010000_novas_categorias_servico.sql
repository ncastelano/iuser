-- Novas categorias de serviço (veterinário, dentista, cabeleireiro,
-- massageador, instrutor, personal, psicóloga), além das já existentes.
-- service_requests.service_type tem CHECK fixo na lista antiga — recria
-- incluindo as novas.

ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_service_type_check;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_service_type_check
    CHECK (service_type IN (
        'psicologa', 'veterinario', 'dentista', 'cabeleireiro', 'massageador', 'instrutor', 'personal',
        'pintor', 'encanador', 'jardineiro', 'eletricista', 'diarista', 'montador', 'outro'
    ));
