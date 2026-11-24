-- 20261130000116_private_store.sql — LOJA PRIVADA (23/11/2026, decisão do dono).
-- A dona liga "Loja privada" e a loja some para quem não é cliente aprovado: nem o nome, nem o logo, nem nada do que ela vende.
-- Só se chega pelo LINK; quem não é aprovado vê apenas "Pedir para ser cliente". A dona aceita ou recusa; aceito, vê tudo como
-- numa loja comum (produtos, serviços, digitais, publicações, horários, comprar, agendar). Ao virar privada, quem já comprou ou
-- agendou na loja vira cliente aprovado automaticamente.
-- A trava é NO BANCO: políticas RESTRITIVAS em stores e products, funções públicas filtradas, e pedido/agendamento recusados.
-- Rollback: supabase/rollbacks/private_store_rollback.sql

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
-- coluna PÚBLICA (nas três listas: aqui, lib/publicColumns.ts e scripts/test-security-exposure.mjs)
DO $$ DECLARE private_cols text[] := ARRAY['is_private']; BEGIN END $$;
GRANT SELECT (is_private) ON public.stores TO anon, authenticated;
GRANT UPDATE (is_private) ON public.stores TO authenticated;   -- só a dona (política stores_owner_write)

CREATE TABLE IF NOT EXISTS public.store_clients (
    store_id   uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'removed')),
    note       text CHECK (note IS NULL OR char_length(note) <= 200),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    PRIMARY KEY (store_id, profile_id)
);
CREATE INDEX IF NOT EXISTS store_clients_pending_idx ON public.store_clients (store_id) WHERE status = 'pending';
ALTER TABLE public.store_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_clients FROM PUBLIC, anon, authenticated;

-- quem pode VER a loja: não é privada, ou é a dona, ou é cliente aprovado (SECURITY DEFINER: lido dentro das políticas sem recursão)
CREATE OR REPLACE FUNCTION public._store_visible(p_store uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE WHEN p_store IS NULL THEN true ELSE COALESCE((
        SELECT NOT s.is_private OR COALESCE(s.owner_id = auth.uid(), false)
               OR EXISTS (SELECT 1 FROM public.store_clients c WHERE c.store_id = s.id AND c.profile_id = auth.uid() AND c.status = 'approved')
          FROM public.stores s WHERE s.id = p_store), true) END
$$;
GRANT EXECUTE ON FUNCTION public._store_visible(uuid) TO anon, authenticated;

-- um id (loja ou produto) que é de uma loja privada que esta pessoa não pode ver
CREATE OR REPLACE FUNCTION public._private_hidden(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_id AND s.is_private AND NOT public._store_visible(s.id))
        OR EXISTS (SELECT 1 FROM public.products p JOIN public.stores s ON s.id = p.store_id WHERE p.id = p_id AND s.is_private AND NOT public._store_visible(s.id))
$$;
REVOKE ALL ON FUNCTION public._private_hidden(uuid) FROM PUBLIC, anon, authenticated;

-- políticas RESTRITIVAS (somam-se às que já existem: sem passar aqui, nenhuma outra libera)
DROP POLICY IF EXISTS stores_private_gate ON public.stores;
CREATE POLICY stores_private_gate ON public.stores AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (NOT is_private OR public._store_visible(id));
DROP POLICY IF EXISTS products_private_gate ON public.products;
CREATE POLICY products_private_gate ON public.products AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (store_id IS NULL OR public._store_visible(store_id));

-- ===== as funções públicas que leem tudo (SECURITY DEFINER) passam a filtrar =====
DO $$ BEGIN
    IF to_regprocedure('public._get_digital_showcase_all(integer,text,uuid)') IS NULL THEN
        ALTER FUNCTION public.get_digital_showcase(integer, text, uuid) RENAME TO _get_digital_showcase_all;
    END IF;
    IF to_regprocedure('public._get_store_promotions_all(integer)') IS NULL THEN
        ALTER FUNCTION public.get_store_promotions(integer) RENAME TO _get_store_promotions_all;
    END IF;
    IF to_regprocedure('public._search_all_all(text,integer,text)') IS NULL THEN
        ALTER FUNCTION public.search_all(text, integer, text) RENAME TO _search_all_all;
    END IF;
    IF to_regprocedure('public._get_outdoor_all(text,integer)') IS NULL THEN
        ALTER FUNCTION public.get_outdoor(text, integer) RENAME TO _get_outdoor_all;
    END IF;
    IF to_regprocedure('public._get_store_busy_slots_all(uuid,date,date)') IS NULL THEN
        ALTER FUNCTION public.get_store_busy_slots(uuid, date, date) RENAME TO _get_store_busy_slots_all;
    END IF;
END $$;
REVOKE ALL ON FUNCTION public._get_digital_showcase_all(integer, text, uuid), public._get_store_promotions_all(integer), public._search_all_all(text, integer, text), public._get_outdoor_all(text, integer), public._get_store_busy_slots_all(uuid, date, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_digital_showcase(p_limit integer DEFAULT 24, p_search text DEFAULT NULL, p_store uuid DEFAULT NULL)
RETURNS TABLE(id uuid, name text, slug text, description text, image_url text, price numeric, store_id uuid, store_slug text, store_name text, store_logo text, view_count integer, created_at timestamp with time zone, videos integer, audios integer, docs integer, links integer, apps integer, seconds bigint, free_items integer, preview_item_id uuid, preview_seconds integer, preview_source text, digital_kind text, is_featured boolean, book_preview_pages integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT * FROM public._get_digital_showcase_all(p_limit, p_search, p_store) x WHERE public._store_visible(x.store_id)
$$;
CREATE OR REPLACE FUNCTION public.get_store_promotions(p_limit integer DEFAULT 24)
RETURNS TABLE(id uuid, name text, slug text, description text, price numeric, compare_at_price numeric, discount_pct integer, image_url text, is_combo boolean, combo_image_uploaded boolean, items jsonb, store_id uuid, store_slug text, store_name text, store_logo text, created_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT * FROM public._get_store_promotions_all(p_limit) x WHERE public._store_visible(x.store_id)
$$;
CREATE OR REPLACE FUNCTION public.search_all(p_term text, p_limit integer DEFAULT 4, p_kind text DEFAULT NULL)
RETURNS TABLE(kind text, id uuid, title text, subtitle text, image text, bucket text, href text, extra text, total integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT * FROM public._search_all_all(p_term, p_limit, p_kind) x WHERE NOT public._private_hidden(x.id)
$$;
CREATE OR REPLACE FUNCTION public.get_outdoor(p_kind text, p_limit integer DEFAULT 12)
RETURNS TABLE(id uuid, slug text, owner_slug text, name text, image text, points integer, rank integer, level integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT * FROM public._get_outdoor_all(p_kind, p_limit) x WHERE NOT public._private_hidden(x.id)
$$;
CREATE OR REPLACE FUNCTION public.get_store_busy_slots(p_store_id uuid, p_from date, p_to date)
RETURNS TABLE(slot_date text, slot_time text, duration_minutes integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT * FROM public._get_store_busy_slots_all(p_store_id, p_from, p_to) WHERE public._store_visible(p_store_id)
$$;
GRANT EXECUTE ON FUNCTION public.get_digital_showcase(integer, text, uuid), public.get_store_promotions(integer), public.search_all(text, integer, text), public.get_outdoor(text, integer), public.get_store_busy_slots(uuid, date, date) TO anon, authenticated;

-- ===== pedido e agendamento só de cliente aprovado =====
CREATE OR REPLACE FUNCTION public.private_store_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_who uuid;
BEGIN
    IF auth.role() IS DISTINCT FROM 'authenticated' OR NEW.store_id IS NULL THEN RETURN NEW; END IF;   -- servidor/rotinas passam
    v_who := CASE TG_TABLE_NAME WHEN 'orders' THEN NEW.buyer_id ELSE NEW.customer_id END;
    IF EXISTS (SELECT 1 FROM public.stores s WHERE s.id = NEW.store_id AND s.is_private AND s.owner_id IS DISTINCT FROM auth.uid())
       AND NOT EXISTS (SELECT 1 FROM public.store_clients c WHERE c.store_id = NEW.store_id AND c.profile_id = COALESCE(v_who, auth.uid()) AND c.status = 'approved') THEN
        RAISE EXCEPTION 'Esta loja é privada: só clientes aprovados pela loja podem pedir ou agendar.' USING ERRCODE = '42501', HINT = 'private_store';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_orders_private_store ON public.orders;
CREATE TRIGGER a_orders_private_store BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.private_store_guard();
DROP TRIGGER IF EXISTS a_appointments_private_store ON public.appointments;
CREATE TRIGGER a_appointments_private_store BEFORE INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.private_store_guard();

-- ===== ao virar privada: quem já comprou ou agendou vira cliente aprovado =====
CREATE OR REPLACE FUNCTION public.private_store_seed_clients()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.is_private AND NOT COALESCE(OLD.is_private, false) THEN
        INSERT INTO public.store_clients (store_id, profile_id, status, decided_at)
        SELECT DISTINCT NEW.id, x.pid, 'approved', now() FROM (
            SELECT buyer_id AS pid FROM public.orders WHERE store_id = NEW.id AND buyer_id IS NOT NULL
            UNION SELECT customer_id FROM public.appointments WHERE store_id = NEW.id AND customer_id IS NOT NULL
        ) x WHERE x.pid IS DISTINCT FROM NEW.owner_id
        ON CONFLICT (store_id, profile_id) DO UPDATE SET status = 'approved', decided_at = now() WHERE public.store_clients.status <> 'removed';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stores_private_seed_clients ON public.stores;
CREATE TRIGGER stores_private_seed_clients AFTER UPDATE OF is_private ON public.stores FOR EACH ROW EXECUTE FUNCTION public.private_store_seed_clients();

-- ===== avisos (ilha, lista do perfil e push) =====
DO $$
DECLARE v_def text; v_list text;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint WHERE conrelid = 'public.profile_notifications'::regclass AND conname = 'profile_notifications_kind_check';
    IF v_def IS NOT NULL AND v_def NOT LIKE '%store_client_request%' THEN
        v_list := substring(v_def FROM '\{([^}]*)\}');
        EXECUTE 'ALTER TABLE public.profile_notifications DROP CONSTRAINT profile_notifications_kind_check';
        EXECUTE format('ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (%L::text[]))', '{' || v_list || ',store_client_request,store_client_approved}');
    END IF;
END $$;

-- ===== o que o app chama =====
-- a "porta" de uma loja pelo LINK: diz só se existe uma loja privada com esse endereço e em que pé está o pedido (nunca o nome)
CREATE OR REPLACE FUNCTION public.get_private_store_gate(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
        'store_id', s.id,
        'visible', public._store_visible(s.id),
        'status', (SELECT c.status FROM public.store_clients c WHERE c.store_id = s.id AND c.profile_id = auth.uid())
    ) END
    FROM (SELECT id FROM public.stores WHERE lower("storeSlug") = lower(p_slug) AND is_private AND is_active LIMIT 1) s
$$;
GRANT EXECUTE ON FUNCTION public.get_private_store_gate(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_store_access(p_store uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); s record; cur record;
BEGIN
    IF v_me IS NULL THEN RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501', HINT = 'login_required'; END IF;
    SELECT id, owner_id, is_private INTO s FROM public.stores WHERE id = p_store AND is_active;
    IF NOT FOUND OR NOT s.is_private THEN RAISE EXCEPTION 'Loja indisponível.' USING HINT = 'not_private'; END IF;
    IF s.owner_id = v_me THEN RETURN jsonb_build_object('status', 'owner'); END IF;
    SELECT * INTO cur FROM public.store_clients WHERE store_id = p_store AND profile_id = v_me;
    IF FOUND AND cur.status IN ('approved', 'pending') THEN RETURN jsonb_build_object('status', cur.status); END IF;
    IF FOUND AND cur.status IN ('rejected', 'removed') AND cur.decided_at > now() - interval '3 days' THEN
        RAISE EXCEPTION 'A loja não aprovou o seu pedido. Você pode pedir de novo em alguns dias.' USING HINT = 'wait';
    END IF;
    INSERT INTO public.store_clients (store_id, profile_id, status, note, created_at, decided_at)
    VALUES (p_store, v_me, 'pending', NULLIF(btrim(left(coalesce(p_note, ''), 200)), ''), now(), NULL)
    ON CONFLICT (store_id, profile_id) DO UPDATE SET status = 'pending', note = EXCLUDED.note, created_at = now(), decided_at = NULL;
    INSERT INTO public.profile_notifications (profile_id, kind, actor_id, ref_id, meta)
    SELECT s.owner_id, 'store_client_request', v_me, p_store, jsonb_build_object('title', 'Pedido para ser cliente', 'text', coalesce(p.name, 'Alguém') || ' quer ser cliente da sua loja privada', 'path', '/editar-loja/' || st."storeSlug")
      FROM public.profiles p, public.stores st WHERE p.id = v_me AND st.id = p_store;
    RETURN jsonb_build_object('status', 'pending');
END $$;
REVOKE ALL ON FUNCTION public.request_store_access(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_store_access(uuid, text) TO authenticated;

-- dona: os pedidos e os clientes (nome, @ e foto públicos)
CREATE OR REPLACE FUNCTION public.list_store_clients(p_store uuid)
RETURNS TABLE(profile_id uuid, name text, slug text, avatar_url text, status text, note text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = auth.uid()) THEN RAISE EXCEPTION 'Só a dona da loja.' USING ERRCODE = '42501'; END IF;
    RETURN QUERY SELECT c.profile_id, p.name, p."profileSlug", p.avatar_url, c.status, c.note, c.created_at
      FROM public.store_clients c JOIN public.profiles p ON p.id = c.profile_id
     WHERE c.store_id = p_store AND c.status IN ('pending', 'approved')
     ORDER BY (c.status = 'pending') DESC, c.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.list_store_clients(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_store_clients(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_store_client(p_store uuid, p_profile uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_slug text; v_name text;
BEGIN
    IF p_status NOT IN ('approved', 'rejected', 'removed') THEN RAISE EXCEPTION 'Situação inválida.'; END IF;
    SELECT "storeSlug", name INTO v_slug, v_name FROM public.stores WHERE id = p_store AND owner_id = auth.uid();
    IF v_slug IS NULL THEN RAISE EXCEPTION 'Só a dona da loja.' USING ERRCODE = '42501'; END IF;
    UPDATE public.store_clients SET status = p_status, decided_at = now() WHERE store_id = p_store AND profile_id = p_profile;
    IF p_status = 'approved' THEN
        INSERT INTO public.profile_notifications (profile_id, kind, actor_id, ref_id, meta)
        VALUES (p_profile, 'store_client_approved', auth.uid(), p_store, jsonb_build_object('title', 'Você foi aceito', 'text', v_name || ' aceitou você como cliente', 'path', '/' || v_slug));
    END IF;
END $$;
REVOKE ALL ON FUNCTION public.decide_store_client(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_store_client(uuid, uuid, text) TO authenticated;
