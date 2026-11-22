-- Volta a 092 (pedido combinado). Depois reaplique get_order_payment e report_order_paid da 091 (20261130000091_order_payment_receipt.sql).
DROP TRIGGER IF EXISTS orders_ready_gate ON public.orders;
DROP FUNCTION IF EXISTS public.orders_ready_gate();
DROP TRIGGER IF EXISTS zz_orders_auto_accept ON public.orders;
DROP FUNCTION IF EXISTS public.orders_auto_accept();
DROP FUNCTION IF EXISTS public.store_reply_order(uuid, text), public.customer_adjust_order(uuid, jsonb), public.customer_agree_order(uuid),
    public.get_store_order_settings(uuid), public.set_store_auto_accept(uuid, boolean);
DROP TABLE IF EXISTS public.store_order_settings;
ALTER TABLE public.orders DROP COLUMN IF EXISTS store_replied_at, DROP COLUMN IF EXISTS customer_agreed_at, DROP COLUMN IF EXISTS customer_adjusted_at;
DELETE FROM public.forum_releases WHERE version = '3.0.5';
-- o tipo de aviso 'order_customer_update' pode ficar no CHECK (não atrapalha)
