-- Rollback da 20261130000129: volta a criação de loja com a exigência de plano (versão de 20260921160000).
DROP FUNCTION IF EXISTS public.create_store_with_access(jsonb);
DROP FUNCTION IF EXISTS public.my_store_slots();
DROP FUNCTION IF EXISTS public.store_slots_allowed(uuid);
DROP TABLE IF EXISTS public.store_slot_grants;

CREATE FUNCTION public.create_store_with_access(p_store jsonb)
RETURNS public.stores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_has_store boolean;
    v_store public.stores;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Não autenticado';
    END IF;
    SELECT has_store INTO v_has_store FROM public.get_active_plan_grants(auth.uid());
    IF NOT v_has_store THEN
        RAISE EXCEPTION 'Assine o plano Loja ou Combo pra criar sua loja.';
    END IF;
    INSERT INTO public.stores (
        name, "storeSlug", description, logo_url, owner_id,
        location, address, store_lat, store_lng,
        address_number, address_complement, category, whatsapp,
        access_granted_at
    ) VALUES (
        p_store->>'name', p_store->>'storeSlug', p_store->>'description', p_store->>'logo_url', auth.uid(),
        CASE WHEN p_store->>'store_lat' IS NOT NULL AND p_store->>'store_lng' IS NOT NULL
            THEN ('POINT(' || (p_store->>'store_lng') || ' ' || (p_store->>'store_lat') || ')')::geography
            ELSE NULL END,
        p_store->>'address',
        NULLIF(p_store->>'store_lat', '')::double precision,
        NULLIF(p_store->>'store_lng', '')::double precision,
        p_store->>'address_number', p_store->>'address_complement', p_store->>'category', p_store->>'whatsapp',
        now()
    ) RETURNING * INTO v_store;
    RETURN v_store;
END;
$$;
REVOKE ALL ON FUNCTION public.create_store_with_access(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.create_store_with_access(jsonb) TO authenticated;
