-- PROMOÇÕES DA LOJA (combos). A loja monta um combo com itens que JÁ tem no catálogo (1 ou mais, cada um com a sua quantidade), vê a soma de tudo, escolhe quanto quer receber
-- pelo conjunto e o desconto aparece calculado. O combo é um PRODUTO da própria loja (categoria "Promoções"): assim o carrinho, o pedido e o preço (calculado pelo banco) funcionam
-- sem mudança. A soma ("de") e o que cada combo leva ficam no banco e só mudam pelas funções (o dono não grava `is_combo`/`compare_at_price` direto).
-- Rollback: supabase/rollbacks/store_promotions_rollback.sql

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_combo boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS compare_at_price numeric(10,2);
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_compare_at_check;
ALTER TABLE public.products ADD CONSTRAINT products_compare_at_check CHECK (compare_at_price IS NULL OR compare_at_price >= 0);

CREATE TABLE IF NOT EXISTS public.product_bundle_items (
    combo_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    item_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
    PRIMARY KEY (combo_id, item_id)
);
CREATE INDEX IF NOT EXISTS product_bundle_items_item_idx ON public.product_bundle_items (item_id);
ALTER TABLE public.product_bundle_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bundle_items_public_read" ON public.product_bundle_items;
CREATE POLICY "bundle_items_public_read" ON public.product_bundle_items FOR SELECT USING (true);
REVOKE ALL ON public.product_bundle_items FROM anon, authenticated;
GRANT SELECT ON public.product_bundle_items TO anon, authenticated;

-- O app (anon/authenticated) não cria nem mexe no "de" e no marcador de combo: só as funções abaixo (e o service role). Ele também não passa o preço do combo da soma dos itens.
CREATE OR REPLACE FUNCTION public.guard_products_combo() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF current_user IN ('anon', 'authenticated') THEN
        IF TG_OP = 'INSERT' THEN
            NEW.is_combo := false;
            NEW.compare_at_price := NULL;
        ELSE
            IF NEW.is_combo IS DISTINCT FROM OLD.is_combo THEN
                RAISE EXCEPTION 'combo_flag_locked' USING ERRCODE = '42501', HINT = 'combo_flag_locked';
            END IF;
            IF NEW.compare_at_price IS DISTINCT FROM OLD.compare_at_price THEN
                RAISE EXCEPTION 'combo_total_locked' USING ERRCODE = '42501', HINT = 'combo_total_locked';
            END IF;
            IF OLD.is_combo AND NEW.price > COALESCE(OLD.compare_at_price, NEW.price) THEN
                RAISE EXCEPTION 'combo_price_above_total' USING ERRCODE = '23514', HINT = 'combo_price_above_total';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_products_combo ON public.products;
CREATE TRIGGER trg_guard_products_combo BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.guard_products_combo();

-- Mudou o preço de um item: a soma dos combos que o levam acompanha (e o preço do combo nunca fica acima da soma)
CREATE OR REPLACE FUNCTION public.refresh_combos_on_item_price() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.products c
       SET compare_at_price = t.total, price = LEAST(c.price, t.total)
      FROM (SELECT b.combo_id, sum(i.price * b.quantity) AS total
              FROM public.product_bundle_items b JOIN public.products i ON i.id = b.item_id
             WHERE b.combo_id IN (SELECT combo_id FROM public.product_bundle_items WHERE item_id = NEW.id)
             GROUP BY b.combo_id) t
     WHERE c.id = t.combo_id;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_refresh_combos_on_item_price ON public.products;
CREATE TRIGGER trg_refresh_combos_on_item_price AFTER UPDATE OF price ON public.products FOR EACH ROW WHEN (OLD.price IS DISTINCT FROM NEW.price) EXECUTE FUNCTION public.refresh_combos_on_item_price();

-- Tirou um item do catálogo: o combo que o levava sai do ar (a loja decide se monta de novo). Salvar o combo troca os itens sem desativar (app.combo_saving).
CREATE OR REPLACE FUNCTION public.deactivate_combo_on_item_removed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF COALESCE(current_setting('app.combo_saving', true), '') <> '1' THEN
        UPDATE public.products SET is_active = false WHERE id = OLD.combo_id AND is_combo;
    END IF;
    RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS trg_deactivate_combo_on_item_removed ON public.product_bundle_items;
CREATE TRIGGER trg_deactivate_combo_on_item_removed AFTER DELETE ON public.product_bundle_items FOR EACH ROW EXECUTE FUNCTION public.deactivate_combo_on_item_removed();

-- Cria ou edita um combo da PRÓPRIA loja. Itens: [{product_id, quantity}] só de produtos físicos ativos da mesma loja. O valor é o que a loja quer receber pelo conjunto (até a soma dos itens).
CREATE OR REPLACE FUNCTION public.save_store_combo(p_store_id uuid, p_combo_id uuid, p_name text, p_note text, p_price numeric, p_items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_owner uuid; v_id uuid := p_combo_id; v_name text := btrim(COALESCE(p_name, ''));
    v_total numeric := 0; v_units numeric := 0; v_img text; v_list text := ''; v_desc text; v_price numeric;
    v_ids uuid[] := '{}'; v_qtys integer[] := '{}'; r record; it record; v_slug text;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501', HINT = 'auth_required'; END IF;
    SELECT owner_id INTO v_owner FROM public.stores WHERE id = p_store_id;
    IF v_owner IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'not_store_owner' USING ERRCODE = '42501', HINT = 'not_store_owner'; END IF;
    IF char_length(v_name) < 3 OR char_length(v_name) > 80 THEN RAISE EXCEPTION 'combo_name_invalid' USING ERRCODE = '22023', HINT = 'combo_name_invalid'; END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 30 THEN
        RAISE EXCEPTION 'combo_items_required' USING ERRCODE = '22023', HINT = 'combo_items_required';
    END IF;

    FOR r IN
        SELECT x.pid, sum(x.qty)::integer AS qty
          FROM (SELECT (e.val ->> 'product_id')::uuid AS pid, COALESCE((e.val ->> 'quantity')::integer, 1) AS qty, e.ord
                  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(val, ord)) x
         GROUP BY x.pid ORDER BY min(x.ord)
    LOOP
        SELECT p.name, p.price, p.image_url, p.delivery_units INTO it
          FROM public.products p
         WHERE p.id = r.pid AND p.store_id = p_store_id AND p.type = 'physical' AND p.listing_type = 'sale' AND NOT p.is_combo AND COALESCE(p.is_active, true);
        IF NOT FOUND THEN RAISE EXCEPTION 'combo_item_invalid' USING ERRCODE = '22023', HINT = 'combo_item_invalid'; END IF;
        IF r.qty < 1 OR r.qty > 20 THEN RAISE EXCEPTION 'combo_quantity_invalid' USING ERRCODE = '22023', HINT = 'combo_quantity_invalid'; END IF;
        v_ids := v_ids || r.pid; v_qtys := v_qtys || r.qty;
        v_total := v_total + it.price * r.qty;
        v_units := v_units + COALESCE(it.delivery_units, 1) * r.qty;
        v_img := COALESCE(v_img, it.image_url);
        v_list := v_list || CASE WHEN v_list = '' THEN '' ELSE ' · ' END || r.qty || '× ' || it.name;
    END LOOP;

    v_price := round(COALESCE(p_price, 0), 2);
    IF v_price <= 0 THEN RAISE EXCEPTION 'combo_price_invalid' USING ERRCODE = '22023', HINT = 'combo_price_invalid'; END IF;
    IF v_price > v_total THEN RAISE EXCEPTION 'combo_price_above_total' USING ERRCODE = '23514', HINT = 'combo_price_above_total'; END IF;

    v_desc := 'Inclui: ' || v_list || CASE WHEN btrim(COALESCE(p_note, '')) <> '' THEN E'\n' || left(btrim(p_note), 300) ELSE '' END;
    PERFORM set_config('app.combo_saving', '1', true);

    IF v_id IS NULL THEN
        v_slug := regexp_replace(lower(translate(v_name, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '[^a-z0-9]+', '-', 'g');
        v_slug := trim(both '-' from v_slug) || '-' || substr(md5(random()::text), 1, 6);
        INSERT INTO public.products (name, slug, description, price, type, is_active, image_url, store_id, owner_id, price_type, category, listing_type, has_addons, delivery_units, is_combo, compare_at_price)
        VALUES (v_name, v_slug, v_desc, v_price, 'physical', true, v_img, p_store_id, v_owner, 'fixed', 'Promoções', 'sale', false, LEAST(GREATEST(v_units, 0.25), 50), true, v_total)
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.products
           SET name = v_name, description = v_desc, price = v_price, image_url = COALESCE(v_img, image_url),
               delivery_units = LEAST(GREATEST(v_units, 0.25), 50), compare_at_price = v_total
         WHERE id = v_id AND store_id = p_store_id AND is_combo;
        IF NOT FOUND THEN RAISE EXCEPTION 'combo_not_found' USING ERRCODE = '22023', HINT = 'combo_not_found'; END IF;
        DELETE FROM public.product_bundle_items WHERE combo_id = v_id;
    END IF;

    INSERT INTO public.product_bundle_items (combo_id, item_id, quantity)
    SELECT v_id, u.i, u.q FROM unnest(v_ids, v_qtys) AS u(i, q);
    PERFORM set_config('app.combo_saving', '', true);
    RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.save_store_combo(uuid, uuid, text, text, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_store_combo(uuid, uuid, text, text, numeric, jsonb) TO authenticated;

-- Vitrine pública das promoções (home 2.0 e 3.0): produtos de lojas ativas com desconto (o "de" maior que o preço), no máximo 3 por loja, mais novos primeiro.
CREATE OR REPLACE FUNCTION public.get_store_promotions(p_limit integer DEFAULT 12)
RETURNS TABLE (id uuid, name text, slug text, description text, price numeric, compare_at_price numeric, discount_pct integer, image_url text, is_combo boolean,
               store_id uuid, store_slug text, store_name text, store_logo text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT r.id, r.name, r.slug, r.description, r.price, r.compare_at_price, r.discount_pct, r.image_url, r.is_combo, r.store_id, r.store_slug, r.store_name, r.store_logo, r.created_at
      FROM (SELECT p.id, p.name, p.slug, p.description, p.price, p.compare_at_price,
                   round((1 - p.price / p.compare_at_price) * 100)::integer AS discount_pct, p.image_url, p.is_combo,
                   s.id AS store_id, s."storeSlug" AS store_slug, s.name AS store_name, s.logo_url AS store_logo, p.created_at,
                   row_number() OVER (PARTITION BY s.id ORDER BY p.created_at DESC) AS rn
              FROM public.products p
              JOIN public.stores s ON s.id = p.store_id AND COALESCE(s.is_active, true)
             WHERE COALESCE(p.is_active, true) AND p.listing_type = 'sale' AND p.type = 'physical'
               AND p.compare_at_price IS NOT NULL AND p.compare_at_price > p.price AND p.price > 0
               AND NOT EXISTS (SELECT 1 FROM public.product_bundle_items b JOIN public.products i ON i.id = b.item_id WHERE b.combo_id = p.id AND NOT COALESCE(i.is_active, true))) r
     WHERE r.rn <= 3
     ORDER BY r.created_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 12), 1), 50);
$$;
GRANT EXECUTE ON FUNCTION public.get_store_promotions(integer) TO anon, authenticated;
