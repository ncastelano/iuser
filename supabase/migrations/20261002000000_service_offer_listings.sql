-- "Meus serviços publicados" no ProfileDashboard: um anúncio do serviço que a
-- pessoa presta (pintor, eletricista, etc.), igual uma Publicação — mas com
-- localização, pra aparecer como pin no mapa de /pedir-servico. Reaproveita a
-- tabela products (mesmo padrão de listing_type='publication'), só que com
-- listing_type='service_offer' e os campos extras que a publicação não usa.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS service_type TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;

-- Solta qualquer CHECK antigo em cima de listing_type (nome desconhecido,
-- criado fora das migrations rastreadas) e recria já incluindo o novo valor.
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.products'::regclass
          AND pg_get_constraintdef(oid) ILIKE '%listing_type%'
    LOOP
        EXECUTE format('ALTER TABLE public.products DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE public.products ADD CONSTRAINT products_listing_type_check
    CHECK (listing_type IN ('sale', 'publication', 'vip_campaign', 'service_offer'));

CREATE INDEX IF NOT EXISTS products_service_offer_idx
    ON public.products (listing_type) WHERE listing_type = 'service_offer';
