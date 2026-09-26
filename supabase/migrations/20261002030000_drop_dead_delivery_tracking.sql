-- Remove o trigger sync_delivery_tracking() (disparava em todo INSERT/UPDATE
-- de delivery_assignments) e a tabela delivery_tracking que ele alimentava.
-- Eram resquício de uma tentativa anterior de rastreio de entrega: a função
-- buscava os dados do pedido em public.store_sales, tabela legada de antes
-- do sistema atual de orders/order_items - nada grava mais em store_sales,
-- então o join nunca encontrava nada e a função só gravava linhas com
-- stops: [] em delivery_tracking. Nada no app lê delivery_tracking hoje.

DROP TRIGGER IF EXISTS delivery_assignments_tracking ON public.delivery_assignments;
DROP FUNCTION IF EXISTS public.sync_delivery_tracking();
DROP TABLE IF EXISTS public.delivery_tracking;
