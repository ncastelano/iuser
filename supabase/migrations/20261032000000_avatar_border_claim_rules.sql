-- Corrige o resgate de bordas: a borda "auto_prepaid" (ex.: "Eu sou brasileiro") também era resgatável por quem NÃO
-- está no Pré-pago, porque o resgate só barrava as 'admin_only'. Agora UMA função decide se a pessoa pode resgatar
-- (e por quê não) — o resgate e o diálogo "Bordas" usam a mesma regra, então nada aparece liberado sem poder.

-- null = pode resgatar; texto = o motivo de não poder
CREATE OR REPLACE FUNCTION public._avatar_border_block_reason(p_user uuid, p_border uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_b public.avatar_borders%ROWTYPE;
    v_req public.network_levels%ROWTYPE;
    v_my_order integer;
    v_in_hierarchy boolean;
BEGIN
    SELECT * INTO v_b FROM public.avatar_borders WHERE id = p_border AND is_active;
    IF NOT FOUND THEN RETURN 'Essa borda não está disponível'; END IF;
    IF v_b.grant_mode = 'admin_only' THEN RETURN 'Só o administrador concede'; END IF;
    IF v_b.available_from IS NOT NULL AND now() < v_b.available_from THEN
        RETURN 'Abre em ' || to_char(v_b.available_from AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
    END IF;
    IF v_b.available_until IS NOT NULL AND now() > v_b.available_until THEN
        RETURN 'Prazo encerrado em ' || to_char(v_b.available_until AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY');
    END IF;

    -- Pré-pago: exigido quando a borda diz que exige, e SEMPRE nas bordas que entram com o Pré-pago (auto_prepaid).
    -- Quem é da hierarquia e a borda vale pra toda a hierarquia também pode, com plano ou sem.
    IF (v_b.requires_prepaid OR v_b.grant_mode = 'auto_prepaid') AND NOT public._has_active_prepaid(p_user) THEN
        SELECT EXISTS (SELECT 1 FROM public.profiles p JOIN public.user_statuses s ON s.id = p.status_id AND s.is_active WHERE p.id = p_user)
          INTO v_in_hierarchy;
        IF NOT (v_b.for_hierarchy AND v_in_hierarchy) THEN
            RETURN 'Pra quem usa o plano Pré-pago';
        END IF;
    END IF;

    IF v_b.required_level_id IS NOT NULL THEN
        SELECT * INTO v_req FROM public.network_levels WHERE id = v_b.required_level_id;
        SELECT l.level_order INTO v_my_order FROM public.network_levels l WHERE l.id = public._effective_level_id(p_user);
        IF COALESCE(v_my_order, 0) < v_req.level_order THEN
            RETURN 'Chegue ao nível ' || v_req.name || ' da graduação pra resgatar';
        END IF;
    END IF;
    RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public._avatar_border_block_reason(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._avatar_border_block_reason(uuid, uuid) TO service_role;

-- Pro diálogo: pra cada borda ativa, o motivo de não poder resgatar (null = pode)
CREATE OR REPLACE FUNCTION public.get_my_border_claim_status()
RETURNS TABLE(border_id uuid, block_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT b.id, public._avatar_border_block_reason(auth.uid(), b.id)
    FROM public.avatar_borders b
    WHERE b.is_active AND auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_my_border_claim_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_border_claim_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_avatar_border(p_slug text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_user uuid := auth.uid();
    v_id uuid;
    v_reason text;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta pra resgatar'; END IF;
    SELECT id INTO v_id FROM public.avatar_borders WHERE slug = p_slug AND is_active;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Essa borda não está disponível'; END IF;
    v_reason := public._avatar_border_block_reason(v_user, v_id);
    IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason; END IF;
    INSERT INTO public.user_avatar_borders (profile_id, border_id, source) VALUES (v_user, v_id, 'claim') ON CONFLICT DO NOTHING;
    RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.claim_avatar_border(text) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_avatar_border(text) TO authenticated;

-- Limpa quem resgatou sem poder (antes do conserto): perde a borda e, se estava usando, volta a ficar sem
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT ub.profile_id, ub.border_id
        FROM public.user_avatar_borders ub
        WHERE ub.source = 'claim'
          AND public._avatar_border_block_reason(ub.profile_id, ub.border_id) IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.avatar_borders b WHERE b.id = ub.border_id AND b.grant_mode = 'auto_prepaid')
    LOOP
        UPDATE public.profiles SET avatar_border_id = NULL WHERE id = r.profile_id AND avatar_border_id = r.border_id;
        DELETE FROM public.user_avatar_borders WHERE profile_id = r.profile_id AND border_id = r.border_id;
    END LOOP;
END $$;
