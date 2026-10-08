-- Vínculo de convite (profiles.upline_id): quem recebe a comissão de indicação.
--
-- Antes: a regra "Permitir UPDATE para próprio usuário" deixava qualquer pessoa logada trocar o próprio upline_id
-- por qualquer outro (desviando a comissão de quem a convidou), e a tela /convite chamava uma função
-- (link_user_to_network) que nunca existiu no banco — caía num UPDATE direto.
--
-- Agora:
--  1) link_user_to_network(p_user_id, p_upline_id): o jeito de uma conta aceitar um convite depois de criada.
--     Só vale pra própria conta, só se ela ainda não tem quem a convidou, e nunca vira ciclo.
--  2) trigger: a PESSOA não consegue mais trocar o próprio upline_id depois de definido. Continua livre pra
--     primeira definição (cadastro: o perfil nasce sem upline e o app preenche logo em seguida) e pra
--     service role / funções internas (admin, exclusão de conta) — que rodam sem auth.uid().

-- Ligar o vínculo faria um ciclo? (a pessoa estaria entre os convidantes do próprio convidante)
CREATE OR REPLACE FUNCTION public._upline_would_cycle(p_user uuid, p_upline uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    WITH RECURSIVE chain AS (
        SELECT id, upline_id, 1 AS depth FROM public.profiles WHERE id = p_upline
        UNION ALL
        SELECT p.id, p.upline_id, c.depth + 1
        FROM public.profiles p JOIN chain c ON p.id = c.upline_id
        WHERE c.depth < 100
    )
    SELECT EXISTS (SELECT 1 FROM chain WHERE id = p_user);
$$;
REVOKE ALL ON FUNCTION public._upline_would_cycle(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._upline_would_cycle(uuid, uuid) TO service_role;

-- A pessoa mexendo no PRÓPRIO vínculo de convite
CREATE OR REPLACE FUNCTION public.guard_upline_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF NEW.upline_id IS NOT DISTINCT FROM OLD.upline_id THEN
        RETURN NEW;
    END IF;

    -- Sem auth.uid() = service role, admin, funções internas (ex: excluir conta zera o vínculo dos convidados)
    IF auth.uid() IS NULL OR auth.uid() <> NEW.id THEN
        RETURN NEW;
    END IF;

    IF OLD.upline_id IS NOT NULL THEN
        RAISE EXCEPTION 'Esta conta já foi convidada por alguém: o vínculo de convite não pode ser trocado.'
            USING ERRCODE = '42501';
    END IF;
    IF NEW.upline_id = NEW.id THEN
        RAISE EXCEPTION 'Uma conta não pode convidar a si mesma.' USING ERRCODE = '22023';
    END IF;
    IF NEW.upline_id IS NOT NULL AND public._upline_would_cycle(NEW.id, NEW.upline_id) THEN
        RAISE EXCEPTION 'Esse convite criaria um ciclo na rede.' USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_upline ON public.profiles;
CREATE TRIGGER profiles_guard_upline
    BEFORE UPDATE OF upline_id ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_upline_change();

-- Aceitar um convite com a conta já criada (tela /convite)
CREATE OR REPLACE FUNCTION public.link_user_to_network(p_user_id uuid, p_upline_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_current uuid;
BEGIN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'Só a própria conta pode aceitar um convite.' USING ERRCODE = '42501';
    END IF;
    IF p_upline_id IS NULL OR p_upline_id = p_user_id THEN
        RAISE EXCEPTION 'Convite inválido.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_upline_id) THEN
        RAISE EXCEPTION 'Quem convidou não foi encontrado.' USING ERRCODE = '22023';
    END IF;

    SELECT upline_id INTO v_current FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF v_current IS NOT NULL THEN
        RAISE EXCEPTION 'Esta conta já foi convidada por alguém.' USING ERRCODE = '42501';
    END IF;
    IF public._upline_would_cycle(p_user_id, p_upline_id) THEN
        RAISE EXCEPTION 'Esse convite criaria um ciclo na rede.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.profiles SET upline_id = p_upline_id, updated_at = now() WHERE id = p_user_id;
    RETURN jsonb_build_object('linked', true, 'upline_id', p_upline_id);
END;
$$;
REVOKE ALL ON FUNCTION public.link_user_to_network(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.link_user_to_network(uuid, uuid) TO authenticated, service_role;
