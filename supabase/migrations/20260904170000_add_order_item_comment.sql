-- O checkout do catálogo já grava uma observação por item (ex.: "sem cebola"),
-- mas a coluna nunca existiu em order_items - todo pedido com itens falhava
-- ao finalizar ("Could not find the 'comment' column of 'order_items'").
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS comment TEXT;
