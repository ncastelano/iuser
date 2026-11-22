-- 20261130000091_order_payment_receipt.sql
--
-- COMPROVANTE DO PIX E DADOS DE QUEM PAGOU (22/11/2026, decisão do dono: "fica mais fácil de saber qual e de onde a pessoa pagou o Pix").
-- Ao tocar "Já paguei" o cliente pode (opcional) anexar o COMPROVANTE do banco dele (foto ou PDF) e dizer QUEM pagou (nome do titular da conta,
-- que pode ser outra pessoa: mãe, empresa...), o BANCO e o código da transação (ID/E2E). A loja vê tudo na janela do pedido e abre o comprovante.
--   - order_payments ganha payer_name, payer_bank, payer_e2e e receipt_path (só por report_order_paid; tabela segue sem acesso do app);
--   - bucket PRIVADO `payment-receipts` (envio só em <uid>/..., imagem ou PDF até 6 MB); quem LÊ: quem enviou e a equipe da loja do pedido;
--   - report_order_paid ganha os parâmetros opcionais (chamada antiga, só com p_order, continua valendo);
--   - get_order_payment devolve os dados ao cliente e à loja (nunca ao entregador).
-- O comprovante NÃO é confirmação: quem confirma continua sendo a loja, olhando a própria conta ("Recebi").
-- Rollback: supabase/rollbacks/order_payment_receipt_rollback.sql

ALTER TABLE public.order_payments ADD COLUMN IF NOT EXISTS payer_name   text CHECK (payer_name IS NULL OR char_length(payer_name) <= 80);
ALTER TABLE public.order_payments ADD COLUMN IF NOT EXISTS payer_bank   text CHECK (payer_bank IS NULL OR char_length(payer_bank) <= 60);
ALTER TABLE public.order_payments ADD COLUMN IF NOT EXISTS payer_e2e    text CHECK (payer_e2e IS NULL OR payer_e2e ~ '^[A-Za-z0-9-]{4,40}$');
ALTER TABLE public.order_payments ADD COLUMN IF NOT EXISTS receipt_path text CHECK (receipt_path IS NULL OR char_length(receipt_path) <= 200);

-- ---------------------------------------------------------------- bucket privado do comprovante
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-receipts', 'payment-receipts', false, 6291456, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS storage_insert_payment_receipts ON storage.objects;
CREATE POLICY storage_insert_payment_receipts ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'payment-receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
        AND (public._direct_upload_allowed() OR public._has_upload_grant(bucket_id, name)));
-- ler: quem enviou, ou a equipe da loja do pedido em que o comprovante foi anexado (para o link assinado)
-- (order_payments não tem acesso do app, então quem confere o vínculo é uma função do banco)
CREATE OR REPLACE FUNCTION public._can_read_payment_receipt(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.order_payments p WHERE p.receipt_path = p_name AND public._is_store_staff(p.store_id))
$$;
REVOKE ALL ON FUNCTION public._can_read_payment_receipt(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._can_read_payment_receipt(text) TO authenticated;
DROP POLICY IF EXISTS storage_select_payment_receipts ON storage.objects;
CREATE POLICY storage_select_payment_receipts ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'payment-receipts' AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text
        OR public._can_read_payment_receipt(name)));
DROP POLICY IF EXISTS storage_delete_payment_receipts ON storage.objects;
CREATE POLICY storage_delete_payment_receipts ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'payment-receipts' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

INSERT INTO public.upload_kinds (kind, label, bucket, provider, max_bytes, mime_types, enabled, note, owner_folder, requires_plan, per_hour_files, per_day_bytes, per_user_bytes, grant_minutes, cleanup_eligible)
VALUES ('payment_receipt', 'Comprovante de pagamento (Pix)', 'payment-receipts', 'supabase', 6291456, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], true,
        'Bucket privado: o comprovante que o cliente anexa ao "Já paguei". Só ele e a equipe da loja do pedido leem. Nunca é limpo sozinho.', true, false, 20, 52428800, 209715200, 15, false)
ON CONFLICT (kind) DO NOTHING;

-- ---------------------------------------------------------------- "Já paguei" com os dados (os novos parâmetros são opcionais)
DROP FUNCTION IF EXISTS public.report_order_paid(uuid);
CREATE OR REPLACE FUNCTION public.report_order_paid(p_order uuid, p_receipt text DEFAULT NULL, p_payer_name text DEFAULT NULL, p_payer_bank text DEFAULT NULL, p_e2e text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); o public.orders; p public.order_payments; v_owner uuid; v_slug text; v_name text;
    v_receipt text := NULLIF(btrim(COALESCE(p_receipt, '')), ''); v_payer text := NULLIF(btrim(COALESCE(p_payer_name, '')), '');
    v_bank text := NULLIF(btrim(COALESCE(p_payer_bank, '')), ''); v_e2e text := NULLIF(regexp_replace(COALESCE(p_e2e, ''), '\s', '', 'g'), '');
BEGIN
    SELECT * INTO o FROM public.orders WHERE id = p_order AND buyer_id = uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    SELECT * INTO p FROM public.order_payments WHERE order_id = p_order FOR UPDATE;
    IF NOT FOUND OR p.method = 'pix_porta' THEN RAISE EXCEPTION 'Este pedido não tem pagamento antecipado' USING ERRCODE = '22023'; END IF;
    IF o.status = 'rejected' THEN RAISE EXCEPTION 'Este pedido foi cancelado' USING ERRCODE = '22023'; END IF;
    IF NOT COALESCE(o.store_visible, true) THEN
        RAISE EXCEPTION 'Ainda não: pague depois que um entregador aceitar e a loja receber o pedido' USING ERRCODE = '22023', HINT = 'order_held';
    END IF;
    -- o comprovante precisa estar na pasta de quem paga, no bucket do comprovante, com nome seguro, e existir
    IF v_receipt IS NOT NULL THEN
        IF v_receipt !~ ('^' || uid::text || '/[A-Za-z0-9._-]{1,120}\.(jpg|jpeg|png|webp|pdf)$') OR v_receipt LIKE '%..%'
           OR NOT EXISTS (SELECT 1 FROM storage.objects so WHERE so.bucket_id = 'payment-receipts' AND so.name = v_receipt) THEN
            RAISE EXCEPTION 'Comprovante inválido. Envie de novo.' USING ERRCODE = '22023', HINT = 'receipt_invalid';
        END IF;
    END IF;
    IF v_e2e IS NOT NULL AND v_e2e !~ '^[A-Za-z0-9-]{4,40}$' THEN
        RAISE EXCEPTION 'O código da transação tem só letras e números.' USING ERRCODE = '22023', HINT = 'e2e_invalid';
    END IF;
    -- já confirmado: nada muda. Já avisado: ainda pode completar os dados/comprovante (sem avisar a loja de novo)
    IF p.status = 'confirmed' THEN RETURN; END IF;
    IF p.status = 'reported' THEN
        UPDATE public.order_payments SET receipt_path = COALESCE(v_receipt, receipt_path), payer_name = COALESCE(left(v_payer, 80), payer_name),
            payer_bank = COALESCE(left(v_bank, 60), payer_bank), payer_e2e = COALESCE(v_e2e, payer_e2e), updated_at = now() WHERE order_id = p_order;
        RETURN;
    END IF;
    UPDATE public.order_payments SET status = 'reported', reported_by = uid, reported_at = now(), updated_at = now(),
        receipt_path = v_receipt, payer_name = left(v_payer, 80), payer_bank = left(v_bank, 60), payer_e2e = v_e2e
    WHERE order_id = p_order;
    SELECT owner_id, "storeSlug" INTO v_owner, v_slug FROM public.stores WHERE id = o.store_id;
    SELECT split_part(COALESCE(name, 'O cliente'), ' ', 1) INTO v_name FROM public.profiles WHERE id = uid;
    PERFORM public._notify(v_owner, 'order_payment', uid, p_order,
        jsonb_build_object('title', 'Pagamento a conferir', 'text', v_name || ' diz que pagou ' || public._brl(p.amount)
            || CASE WHEN p.method = 'pix' THEN ' por Pix' ELSE ' pelo seu link' END
            || CASE WHEN v_payer IS NOT NULL THEN ' (no nome de ' || left(v_payer, 40) || CASE WHEN v_bank IS NOT NULL THEN ', ' || left(v_bank, 30) ELSE '' END || ')' ELSE '' END
            || CASE WHEN v_receipt IS NOT NULL THEN ' e mandou o comprovante' ELSE '' END || '. Confira na sua conta e confirme.',
            'path', '/painel-loja/' || v_slug || '/pedidos?pedido=' || p_order),
        'pay-rep:' || p_order || ':' || floor(extract(epoch FROM now()))::text);
END; $function$;
REVOKE ALL ON FUNCTION public.report_order_paid(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_order_paid(uuid, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------- leitura: os dados de quem pagou para o cliente e a loja
CREATE OR REPLACE FUNCTION public.get_order_payment(p_order uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); o public.orders; p public.order_payments; s record; v_role text; v_link text; v_held boolean; v_show boolean;
BEGIN
    IF uid IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO o FROM public.orders WHERE id = p_order;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF o.buyer_id = uid THEN v_role := 'buyer';
    ELSIF COALESCE(o.store_visible, true) AND public._is_store_staff(o.store_id) THEN v_role := 'store';
    ELSIF EXISTS (SELECT 1 FROM public.ride_requests r WHERE r.order_id = p_order AND r.driver_id = uid AND r.status IN ('accepted', 'completed')) THEN v_role := 'driver';
    ELSE RETURN NULL; END IF;
    SELECT * INTO p FROM public.order_payments WHERE order_id = p_order;
    IF NOT FOUND THEN RETURN jsonb_build_object('role', v_role, 'method', NULL, 'payment_method', o.payment_method); END IF;
    v_held := NOT COALESCE(o.store_visible, true) AND o.status = 'pending';
    v_show := v_role IN ('buyer', 'store');
    SELECT name, pix_key, pix_key_type INTO s FROM public.stores WHERE id = o.store_id;
    IF p.method = 'link_cartao' AND v_role = 'buyer' THEN SELECT card_link INTO v_link FROM public.store_payment_links WHERE store_id = o.store_id; END IF;
    RETURN jsonb_build_object(
        'role', v_role, 'method', p.method, 'payment_method', o.payment_method, 'status', p.status, 'amount', p.amount,
        'reported_at', p.reported_at, 'confirmed_at', p.confirmed_at, 'store_name', s.name,
        'held', v_held, 'txid', upper(substr(replace(p_order::text, '-', ''), 1, 12)),
        'pix_key', CASE WHEN v_role = 'buyer' AND NOT v_held AND p.method IN ('pix', 'pix_porta') AND p.status IN ('awaiting', 'not_received') THEN s.pix_key END,
        'pix_key_type', CASE WHEN v_role = 'buyer' AND p.method IN ('pix', 'pix_porta') THEN s.pix_key_type END,
        'card_link', CASE WHEN v_role = 'buyer' AND NOT v_held AND p.status IN ('awaiting', 'not_received') THEN v_link END,
        -- quem pagou (o cliente e a loja; o entregador nunca)
        'payer_name', CASE WHEN v_show THEN p.payer_name END,
        'payer_bank', CASE WHEN v_show THEN p.payer_bank END,
        'payer_e2e', CASE WHEN v_show THEN p.payer_e2e END,
        'receipt_path', CASE WHEN v_show THEN p.receipt_path END);
END; $function$;

-- a lista do painel: saber quais pedidos têm comprovante
DROP FUNCTION IF EXISTS public.get_store_order_payments(uuid);
CREATE OR REPLACE FUNCTION public.get_store_order_payments(p_store uuid)
 RETURNS TABLE(order_id uuid, method text, status text, amount numeric, reported_at timestamptz, has_receipt boolean, payer_name text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT public._is_store_staff(p_store) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE = '42501'; END IF;
    RETURN QUERY SELECT p.order_id, p.method, p.status, p.amount, p.reported_at, p.receipt_path IS NOT NULL, p.payer_name
        FROM public.order_payments p JOIN public.orders o ON o.id = p.order_id
        WHERE p.store_id = p_store AND COALESCE(o.store_visible, true) AND o.created_at > now() - interval '7 days'
        ORDER BY o.created_at DESC LIMIT 300;
END; $function$;
REVOKE ALL ON FUNCTION public.get_store_order_payments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_order_payments(uuid) TO authenticated;

-- ---------------------------------------------------------------- novidade no Fórum
INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.4', 'Comprovante do Pix no pedido',
       'Ficou mais fácil a loja saber quem pagou e de onde veio o Pix.',
       ARRAY['Ao tocar em "Já paguei", você pode anexar o comprovante do banco (foto ou PDF)',
             'Também dá para dizer em nome de quem foi o Pix, o banco e o código da transação',
             'A loja vê tudo isso no pedido e abre o comprovante com um toque'],
       ARRAY['O aviso de pagamento para a loja já diz em nome de quem foi o Pix'],
       ARRAY[]::text[],
       now() + interval '3 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.4');
