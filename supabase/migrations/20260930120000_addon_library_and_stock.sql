-- Biblioteca de adicionais da loja: o que a loja cadastra como adicional fica
-- salvo e pode ser oferecido em outros produtos sem digitar de novo.
CREATE TABLE IF NOT EXISTS public.store_addon_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS store_addon_library_store_name_idx
    ON public.store_addon_library (store_id, lower(name));

ALTER TABLE public.store_addon_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Loja vê sua biblioteca de adicionais" ON public.store_addon_library FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
);
CREATE POLICY "Loja cria na sua biblioteca de adicionais" ON public.store_addon_library FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
);
CREATE POLICY "Loja edita sua biblioteca de adicionais" ON public.store_addon_library FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
);
CREATE POLICY "Loja apaga da sua biblioteca de adicionais" ON public.store_addon_library FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
);

-- Os adicionais que as lojas já têm entram na biblioteca (o mais recente de
-- cada nome define o preço).
INSERT INTO public.store_addon_library (store_id, name, price)
SELECT DISTINCT ON (store_id, lower(name)) store_id, name, price
FROM public.product_addons
ORDER BY store_id, lower(name), created_at DESC
ON CONFLICT DO NOTHING;

-- A tela de edição do produto tem o campo Estoque, mas a coluna nunca existiu
-- (salvar dava erro de coluna inexistente).
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER;
