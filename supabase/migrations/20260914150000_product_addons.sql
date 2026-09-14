-- Adicionais (ingredientes extras) por produto — a loja decide, produto a
-- produto, se ele aceita adicionais (ex: lanches, pizzas) e cadastra cada
-- adicional com seu próprio nome e preço. Quando ligado, o cliente ganha
-- uma etapa extra ao adicionar esse produto no carrinho.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS has_addons BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.product_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS product_addons_product_idx ON public.product_addons (product_id);
CREATE INDEX IF NOT EXISTS product_addons_store_idx ON public.product_addons (store_id);

ALTER TABLE public.product_addons ENABLE ROW LEVEL SECURITY;

-- Qualquer pessoa pode ver os adicionais ativos — precisa aparecer pro
-- cliente escolher ao adicionar o produto no carrinho, mesmo sem login.
CREATE POLICY "Adicionais ativos são públicos" ON public.product_addons FOR SELECT USING (is_active = true);

-- A loja dona do produto vê, cria, edita e apaga os próprios adicionais
-- (inclusive os desativados, pra poder reativar).
CREATE POLICY "Loja vê seus adicionais" ON public.product_addons FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
);
CREATE POLICY "Loja cria adicionais" ON public.product_addons FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
);
CREATE POLICY "Loja edita seus adicionais" ON public.product_addons FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
);
CREATE POLICY "Loja apaga seus adicionais" ON public.product_addons FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
);

-- Guarda os adicionais escolhidos (nome + preço no momento da compra, não
-- uma referência viva) junto do item do pedido — mesmo padrão do "comment".
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS addons JSONB;
