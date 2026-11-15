-- BUSCA: o que as pessoas procuram. Ao tocar na busca da home (3.0) a pessoa vê as últimas buscas dela e o que está em alta
-- no iUser, na cidade, no estado e entre quem ela segue. Aqui moram o registro (search_events) e as duas funções de leitura.
-- Privacidade: a tabela não tem acesso do app (tudo por função); só buscas de pessoas LOGADAS contam (impede inflar o ranking
-- com robôs); a cidade e o estado saem do endereço do PRÓPRIO perfil, nunca do que o app manda; um termo só aparece em "em alta"
-- se vários USUÁRIOS DIFERENTES o buscaram (2 no geral/cidade/estado, 3 entre quem a pessoa segue) e nunca se mostra quem buscou.

CREATE TABLE IF NOT EXISTS public.search_events (
    id         bigserial PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    term       text NOT NULL CHECK (char_length(term) BETWEEN 2 AND 40),
    city       text,
    state      text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_events_term_idx  ON public.search_events (term, created_at DESC);
CREATE INDEX IF NOT EXISTS search_events_state_idx ON public.search_events (state, created_at DESC);
CREATE INDEX IF NOT EXISTS search_events_city_idx  ON public.search_events (city, state, created_at DESC);
CREATE INDEX IF NOT EXISTS search_events_user_idx  ON public.search_events (user_id, created_at DESC);
ALTER TABLE public.search_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.search_events FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.search_events_id_seq FROM anon, authenticated;

-- termos que o admin tirou das listas "em alta" (palavrão, golpe...). Sem tela ainda: por SQL com a chave de serviço.
CREATE TABLE IF NOT EXISTS public.search_blocked_terms (
    term       text PRIMARY KEY,
    reason     text,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.search_blocked_terms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.search_blocked_terms FROM anon, authenticated;

-- minúsculas, sem acento, espaços colapsados; NULL = não vale como busca (curta, longa, link, e-mail, telefone/CPF...)
CREATE OR REPLACE FUNCTION public._search_norm(p_term text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE t text;
BEGIN
    t := lower(public.unaccent(btrim(COALESCE(p_term, ''))));
    t := regexp_replace(t, '\s+', ' ', 'g');
    IF char_length(t) < 2 OR char_length(t) > 40 THEN RETURN NULL; END IF;
    IF t ~ '[@/\\]' OR t ~ 'https?:|www\.|\.com' THEN RETURN NULL; END IF;
    IF char_length(regexp_replace(t, '[^0-9]', '', 'g')) >= 5 THEN RETURN NULL; END IF;
    IF t !~ '[a-z]' THEN RETURN NULL; END IF;
    RETURN t;
END; $$;
REVOKE ALL ON FUNCTION public._search_norm(text) FROM public, anon, authenticated;

-- cidade e estado do endereço do perfil ("Rua X, 10, Centro, Porto Velho - RO")
CREATE OR REPLACE FUNCTION public._search_place(p_user uuid, OUT city text, OUT state text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a text; m text[];
BEGIN
    SELECT address INTO a FROM public.profiles WHERE id = p_user;
    IF a IS NULL THEN RETURN; END IF;
    -- o ÚLTIMO trecho "Cidade - UF" do endereço
    SELECT x INTO m FROM (SELECT x, row_number() OVER () AS n FROM regexp_matches(a, ',\s*([^,]+?)\s*-\s*([A-Za-z]{2})(?=\s*(?:,|$))', 'g') AS x) q ORDER BY n DESC LIMIT 1;
    IF m IS NOT NULL THEN
        city := btrim(m[1]); state := upper(m[2]);
        RETURN;
    END IF;
    -- endereço sem "- UF" ("Av. Sete de Setembro, Centro, Porto Velho"): a cidade é o último trecho e o estado, o que a maioria
    -- dos outros endereços dessa mesma cidade usa
    city := nullif(btrim(regexp_replace(split_part(a, ',', array_length(string_to_array(a, ','), 1)), '[0-9-]{5,}|brasil', '', 'gi')), '');
    IF city IS NULL THEN RETURN; END IF;
    SELECT upper(substring(p.address FROM ',\s*' || regexp_replace(city, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\s*-\s*([A-Za-z]{2})(?=\s*(?:,|$))')) INTO state
      FROM public.profiles p WHERE p.address ~* (',\s*' || regexp_replace(city, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\s*-\s*[A-Za-z]{2}')
     GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
END; $$;
REVOKE ALL ON FUNCTION public._search_place(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public._uf_name(p_uf text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT COALESCE((jsonb_build_object('AC','Acre','AL','Alagoas','AP','Amapá','AM','Amazonas','BA','Bahia','CE','Ceará','DF','Distrito Federal',
        'ES','Espírito Santo','GO','Goiás','MA','Maranhão','MT','Mato Grosso','MS','Mato Grosso do Sul','MG','Minas Gerais','PA','Pará','PB','Paraíba',
        'PR','Paraná','PE','Pernambuco','PI','Piauí','RJ','Rio de Janeiro','RN','Rio Grande do Norte','RS','Rio Grande do Sul','RO','Rondônia',
        'RR','Roraima','SC','Santa Catarina','SP','São Paulo','SE','Sergipe','TO','Tocantins') ->> upper(p_uf)), p_uf);
$$;
REVOKE ALL ON FUNCTION public._uf_name(text) FROM public, anon, authenticated;

-- Registra uma busca da pessoa logada. Nunca devolve erro útil de propósito: o app não espera por isso nem muda nada se falhar.
CREATE OR REPLACE FUNCTION public.log_search(p_term text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); t text; v_city text; v_state text;
BEGIN
    IF v_uid IS NULL THEN RETURN; END IF;
    t := public._search_norm(p_term);
    IF t IS NULL THEN RETURN; END IF;
    IF (SELECT count(*) FROM public.search_events WHERE user_id = v_uid AND created_at > now() - interval '1 hour') >= 60 THEN RETURN; END IF;
    IF EXISTS (SELECT 1 FROM public.search_events WHERE user_id = v_uid AND term = t AND created_at > now() - interval '10 minutes') THEN RETURN; END IF;
    SELECT p.city, p.state INTO v_city, v_state FROM public._search_place(v_uid) p;
    INSERT INTO public.search_events (user_id, term, city, state) VALUES (v_uid, t, v_city, v_state);
END; $$;
REVOKE ALL ON FUNCTION public.log_search(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_search(text) TO authenticated, service_role;

-- Apaga TODAS as buscas da própria pessoa (botão "Limpar" do histórico)
CREATE OR REPLACE FUNCTION public.clear_my_searches()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    DELETE FROM public.search_events WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.clear_my_searches() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.clear_my_searches() TO authenticated, service_role;

-- O que está em alta. p_scope: global | city | state | following. `people` = quantas pessoas DIFERENTES buscaram; `place` = nome do lugar.
CREATE OR REPLACE FUNCTION public.get_search_trends(p_scope text, p_limit integer DEFAULT 10)
RETURNS TABLE(term text, people integer, place text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_lim integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 20); v_city text; v_state text;
BEGIN
    IF v_uid IS NOT NULL THEN SELECT p.city, p.state INTO v_city, v_state FROM public._search_place(v_uid) p; END IF;

    IF p_scope = 'global' THEN
        RETURN QUERY
        SELECT e.term, count(DISTINCT e.user_id)::integer, NULL::text FROM public.search_events e
        WHERE e.created_at > now() - interval '14 days' AND NOT EXISTS (SELECT 1 FROM public.search_blocked_terms b WHERE b.term = e.term)
        GROUP BY e.term HAVING count(DISTINCT e.user_id) >= 2 ORDER BY 2 DESC, e.term LIMIT v_lim;
    ELSIF p_scope = 'city' THEN
        IF v_city IS NULL THEN RETURN; END IF;
        RETURN QUERY
        SELECT e.term, count(DISTINCT e.user_id)::integer, v_city FROM public.search_events e
        WHERE e.created_at > now() - interval '14 days' AND e.city = v_city AND e.state = v_state
          AND NOT EXISTS (SELECT 1 FROM public.search_blocked_terms b WHERE b.term = e.term)
        GROUP BY e.term HAVING count(DISTINCT e.user_id) >= 2 ORDER BY 2 DESC, e.term LIMIT v_lim;
    ELSIF p_scope = 'state' THEN
        IF v_state IS NULL THEN RETURN; END IF;
        RETURN QUERY
        SELECT e.term, count(DISTINCT e.user_id)::integer, public._uf_name(v_state) FROM public.search_events e
        WHERE e.created_at > now() - interval '14 days' AND e.state = v_state
          AND NOT EXISTS (SELECT 1 FROM public.search_blocked_terms b WHERE b.term = e.term)
        GROUP BY e.term HAVING count(DISTINCT e.user_id) >= 2 ORDER BY 2 DESC, e.term LIMIT v_lim;
    ELSIF p_scope = 'following' THEN
        IF v_uid IS NULL THEN RETURN; END IF;
        -- só termos que PELO MENOS 3 pessoas diferentes entre as que a pessoa segue buscaram: ninguém é identificado
        RETURN QUERY
        SELECT e.term, count(DISTINCT e.user_id)::integer, NULL::text FROM public.search_events e
        JOIN public.follows f ON f.following_id = e.user_id AND f.follower_id = v_uid
        WHERE e.created_at > now() - interval '14 days' AND NOT EXISTS (SELECT 1 FROM public.search_blocked_terms b WHERE b.term = e.term)
        GROUP BY e.term HAVING count(DISTINCT e.user_id) >= 3 ORDER BY 2 DESC, e.term LIMIT v_lim;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.get_search_trends(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_search_trends(text, integer) TO anon, authenticated, service_role;
