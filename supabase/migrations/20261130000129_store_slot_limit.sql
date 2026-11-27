-- 20261130000129 — LIMITE DE LOJAS POR PESSOA (decisão do dono, 26/11/2026): cada pessoa tem até 3 lojas SEM pagar;
-- a 4ª em diante custa R$ 50 cada. A criação de loja deixa de exigir plano (Loja/Combo) para as 3 primeiras.
-- Liberações pagas ficam em store_slot_grants (uma linha = uma loja extra liberada). Ainda NÃO há cobrança automática:
-- a liberação é gravada por quem confirma o pagamento (servidor/admin). Sem liberação, a 4ª loja é recusada (HINT store_limit).
-- Rollback: supabase/rollbacks/store_slot_limit_rollback.sql
-- Cenários: supabase/tests/store_slot_limit_scenarios.sql

CREATE TABLE IF NOT EXISTS public.store_slot_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    source text NOT NULL DEFAULT 'payment' CHECK (source IN ('payment', 'admin')),
    note text
);
CREATE INDEX IF NOT EXISTS store_slot_grants_profile_idx ON public.store_slot_grants (profile_id);

-- sem acesso do app: só servidor/admin escrevem e leem
ALTER TABLE public.store_slot_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_slot_grants FROM PUBLIC, anon, authenticated;

-- quantas lojas a pessoa pode ter: 3 de graça + uma por liberação paga
CREATE OR REPLACE FUNCTION public.store_slots_allowed(p_profile uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 3 + (SELECT count(*)::integer FROM public.store_slot_grants g WHERE g.profile_id = p_profile)
$$;
REVOKE ALL ON FUNCTION public.store_slots_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_slots_allowed(uuid) TO authenticated;

-- a pessoa vê quantas lojas tem e quantas pode ter (para a tela de criar loja avisar antes)
CREATE OR REPLACE FUNCTION public.my_store_slots()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE jsonb_build_object(
        'stores', (SELECT count(*)::integer FROM public.stores s WHERE s.owner_id = auth.uid()),
        'allowed', public.store_slots_allowed(auth.uid()),
        'free', 3,
        'extra_price', 50
    ) END
$$;
REVOKE ALL ON FUNCTION public.my_store_slots() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_store_slots() TO authenticated;

-- criação de loja: sem plano obrigatório; o limite de lojas é que trava
DROP FUNCTION IF EXISTS public.create_store_with_access(jsonb);

CREATE FUNCTION public.create_store_with_access(p_store jsonb)
RETURNS public.stores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count integer;
    v_allowed integer;
    v_store public.stores;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Não autenticado';
    END IF;

    SELECT count(*)::integer INTO v_count FROM public.stores WHERE owner_id = auth.uid();
    v_allowed := public.store_slots_allowed(auth.uid());
    IF v_count >= v_allowed THEN
        RAISE EXCEPTION 'Você já tem % lojas. A partir da 4ª, cada loja custa R$ 50.', v_count
            USING ERRCODE = 'P0001', HINT = 'store_limit';
    END IF;

    INSERT INTO public.stores (
        name, "storeSlug", description, logo_url, owner_id,
        location, address, store_lat, store_lng,
        address_number, address_complement, category, whatsapp,
        access_granted_at
    ) VALUES (
        p_store->>'name',
        p_store->>'storeSlug',
        p_store->>'description',
        p_store->>'logo_url',
        auth.uid(),
        CASE WHEN p_store->>'store_lat' IS NOT NULL AND p_store->>'store_lng' IS NOT NULL
            THEN ('POINT(' || (p_store->>'store_lng') || ' ' || (p_store->>'store_lat') || ')')::geography
            ELSE NULL END,
        p_store->>'address',
        NULLIF(p_store->>'store_lat', '')::double precision,
        NULLIF(p_store->>'store_lng', '')::double precision,
        p_store->>'address_number',
        p_store->>'address_complement',
        p_store->>'category',
        p_store->>'whatsapp',
        now()
    ) RETURNING * INTO v_store;

    RETURN v_store;
END;
$$;

REVOKE ALL ON FUNCTION public.create_store_with_access(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_store_with_access(jsonb) TO authenticated;
