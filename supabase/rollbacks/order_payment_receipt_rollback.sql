-- Volta a 091: tira o comprovante e os dados de quem pagou (as funções voltam às da 080/074).
DROP FUNCTION IF EXISTS public.report_order_paid(uuid, text, text, text, text);
DROP POLICY IF EXISTS storage_insert_payment_receipts ON storage.objects;
DROP POLICY IF EXISTS storage_select_payment_receipts ON storage.objects;
DROP POLICY IF EXISTS storage_delete_payment_receipts ON storage.objects;
DROP FUNCTION IF EXISTS public._can_read_payment_receipt(text);
DELETE FROM public.upload_kinds WHERE kind = 'payment_receipt';
ALTER TABLE public.order_payments DROP COLUMN IF EXISTS payer_name, DROP COLUMN IF EXISTS payer_bank, DROP COLUMN IF EXISTS payer_e2e, DROP COLUMN IF EXISTS receipt_path;
-- depois, reaplique report_order_paid(uuid) e get_order_payment de 20261130000080_order_payment_after_release.sql
-- e get_store_order_payments de 20261130000074_order_payments.sql (DROP da versão de 7 colunas antes). O bucket payment-receipts fica (o Storage só apaga pela API).
DELETE FROM public.forum_releases WHERE version = '3.0.4';
