-- Compartilhamentos por serviço/produto/publicação (o dono vê no painel: "Serviços publicados" do perfil).
-- Mesmo padrão de profiles/stores: contador + RPC que só soma 1 (não aceita valor do app).
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS share_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_product_share_count(p_product uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    UPDATE public.products SET share_count = share_count + 1 WHERE id = p_product RETURNING share_count;
$$;
REVOKE ALL ON FUNCTION public.increment_product_share_count(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_product_share_count(uuid) TO anon, authenticated, service_role;
