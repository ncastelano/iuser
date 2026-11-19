-- 20261130000082_legal_acceptances_seller.sql
--
-- ACEITES LEGAIS E "QUEM VENDE" (18/11/2026, revisão antes de comercializar).
--
-- 1. ACEITES REGISTRADOS (legal_documents + legal_acceptances): o cadastro só dizia "ao criar a conta você concorda com os Termos";
--    nada era guardado. Agora cada aceite fica com QUEM, QUAL VERSÃO e QUANDO. A versão em vigor é do banco (o app nunca manda a versão):
--      terms               = Termos de Uso + Política de Privacidade (todo mundo; versão nova = todos aceitam de novo)
--      driver_requirements = declaração do motorista (CNH com "exerce atividade remunerada", documentos, seguro APP, regras da cidade)
--      store_regulated     = a loja declara que tem as licenças para remédio, bebida alcoólica, gás, tabaco (por LOJA: scope_id = loja)
--    Ligar o MODO MOTORISTA exige a declaração do motorista (gatilho em driver_pricing; só quem usa o app — scripts e o servidor passam).
--
-- 2. QUEM VENDE (Decreto 7.962/2013: quem vende pela internet mostra nome/razão social, CPF/CNPJ e endereço):
--      stores.seller_name, seller_address, seller_doc_public = PÚBLICAS (página da loja). seller_doc (o número inteiro) é PRIVADO;
--      o CNPJ sai inteiro no seller_doc_public e o CPF sai MASCARADO (***.456.789-**). Gravação só por set_store_seller (confere os dígitos).
--
-- Rollback: supabase/rollbacks/legal_acceptances_seller_rollback.sql. Cenários: supabase/tests/legal_acceptances_scenarios.sql.

-- ── 1. aceites ────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.legal_documents (
    doc        text PRIMARY KEY CHECK (doc IN ('terms', 'driver_requirements', 'store_regulated')),
    version    text NOT NULL CHECK (length(version) BETWEEN 1 AND 40),
    title      text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.legal_documents (doc, version, title) VALUES
    ('terms', '2026-11-18', 'Termos de Uso e Política de Privacidade'),
    ('driver_requirements', '2026-11-18', 'Declaração do motorista e entregador'),
    ('store_regulated', '2026-11-18', 'Licenças dos produtos com regra própria')
ON CONFLICT (doc) DO NOTHING;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.legal_documents TO anon, authenticated;
DROP POLICY IF EXISTS legal_documents_read ON public.legal_documents;
CREATE POLICY legal_documents_read ON public.legal_documents FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    doc         text NOT NULL REFERENCES public.legal_documents(doc),
    version     text NOT NULL,
    scope_id    uuid,
    accepted_at timestamptz NOT NULL DEFAULT now(),
    user_agent  text CHECK (user_agent IS NULL OR length(user_agent) <= 300)
);
CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_once ON public.legal_acceptances (user_id, doc, version, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_acceptances FROM PUBLIC, anon, authenticated;   -- só pelas funções

CREATE OR REPLACE FUNCTION public._has_accepted(p_user uuid, p_doc text, p_scope uuid DEFAULT NULL) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM public.legal_acceptances a JOIN public.legal_documents d ON d.doc = a.doc AND d.version = a.version
                   WHERE a.user_id = p_user AND a.doc = p_doc AND a.scope_id IS NOT DISTINCT FROM p_scope)
$$;
REVOKE ALL ON FUNCTION public._has_accepted(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- aceita a versão EM VIGOR (a do banco)
CREATE OR REPLACE FUNCTION public.accept_legal(p_doc text, p_scope uuid DEFAULT NULL, p_user_agent text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_ver text;
BEGIN
    IF uid IS NULL THEN RAISE EXCEPTION 'Entre na sua conta' USING ERRCODE = '42501'; END IF;
    SELECT version INTO v_ver FROM public.legal_documents WHERE doc = p_doc;
    IF v_ver IS NULL THEN RAISE EXCEPTION 'Documento inválido' USING ERRCODE = '22023'; END IF;
    IF p_doc = 'store_regulated' THEN
        IF p_scope IS NULL OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_scope AND owner_id = uid) THEN
            RAISE EXCEPTION 'Só o dono da loja faz esta declaração' USING ERRCODE = '42501';
        END IF;
    ELSIF p_scope IS NOT NULL THEN
        RAISE EXCEPTION 'Documento inválido' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.legal_acceptances (user_id, doc, version, scope_id, user_agent) VALUES (uid, p_doc, v_ver, p_scope, left(p_user_agent, 300))
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('doc', p_doc, 'version', v_ver, 'accepted', true);
END; $$;
REVOKE ALL ON FUNCTION public.accept_legal(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_legal(text, uuid, text) TO authenticated, service_role;

-- o que a pessoa já aceitou da versão em vigor ({ terms: {version, accepted, accepted_at}, ... }); com p_scope, a declaração daquela loja
CREATE OR REPLACE FUNCTION public.get_my_legal(p_scope uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(jsonb_object_agg(d.doc, jsonb_build_object('version', d.version, 'title', d.title,
               'accepted', a.accepted_at IS NOT NULL, 'accepted_at', a.accepted_at)), '{}'::jsonb)
      FROM public.legal_documents d
      LEFT JOIN LATERAL (SELECT accepted_at FROM public.legal_acceptances x
                         WHERE x.user_id = auth.uid() AND x.doc = d.doc AND x.version = d.version
                           AND x.scope_id IS NOT DISTINCT FROM CASE WHEN d.doc = 'store_regulated' THEN p_scope END
                         ORDER BY accepted_at DESC LIMIT 1) a ON true
     WHERE auth.uid() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.get_my_legal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_legal(uuid) TO authenticated, service_role;

-- ligar o modo motorista pelo app exige a declaração do motorista (desligar e o que já estava ligado não mudam)
CREATE OR REPLACE FUNCTION public.driver_pricing_require_declaration() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.driver_mode_active AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.driver_mode_active, false))
       AND COALESCE(auth.role(), '') = 'authenticated'
       AND NOT public._has_accepted(NEW.driver_id, 'driver_requirements') THEN
        RAISE EXCEPTION 'Antes de ficar online, confirme a declaração do motorista (CNH, documentos e seguro).' USING ERRCODE = '42501', HINT = 'driver_declaration_required';
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS driver_pricing_require_declaration ON public.driver_pricing;
CREATE TRIGGER driver_pricing_require_declaration BEFORE INSERT OR UPDATE OF driver_mode_active ON public.driver_pricing
    FOR EACH ROW EXECUTE FUNCTION public.driver_pricing_require_declaration();

-- ── 2. quem vende ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- dígitos verificadores (CPF e CNPJ)
CREATE OR REPLACE FUNCTION public._doc_valid(p_type text, p_digits text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d int[]; s int; r int; i int; w1 int[] := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2]; w2 int[] := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
BEGIN
    IF p_digits IS NULL OR p_digits !~ '^[0-9]+$' THEN RETURN false; END IF;
    SELECT array_agg(substr(p_digits, k, 1)::int ORDER BY k) INTO d FROM generate_series(1, length(p_digits)) k;
    IF p_type = 'cpf' THEN
        IF length(p_digits) <> 11 OR p_digits ~ '^(.)\1{10}$' THEN RETURN false; END IF;
        s := 0; FOR i IN 1..9 LOOP s := s + d[i] * (11 - i); END LOOP; r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
        IF r <> d[10] THEN RETURN false; END IF;
        s := 0; FOR i IN 1..10 LOOP s := s + d[i] * (12 - i); END LOOP; r := (s * 10) % 11; IF r = 10 THEN r := 0; END IF;
        RETURN r = d[11];
    ELSIF p_type = 'cnpj' THEN
        IF length(p_digits) <> 14 OR p_digits ~ '^(.)\1{13}$' THEN RETURN false; END IF;
        s := 0; FOR i IN 1..12 LOOP s := s + d[i] * w1[i]; END LOOP; r := s % 11; r := CASE WHEN r < 2 THEN 0 ELSE 11 - r END;
        IF r <> d[13] THEN RETURN false; END IF;
        s := 0; FOR i IN 1..13 LOOP s := s + d[i] * w2[i]; END LOOP; r := s % 11; r := CASE WHEN r < 2 THEN 0 ELSE 11 - r END;
        RETURN r = d[14];
    END IF;
    RETURN false;
END; $$;

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS seller_name text CHECK (seller_name IS NULL OR length(seller_name) BETWEEN 2 AND 120);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS seller_doc_type text CHECK (seller_doc_type IS NULL OR seller_doc_type IN ('cpf', 'cnpj'));
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS seller_doc text CHECK (seller_doc IS NULL OR seller_doc ~ '^[0-9]{11}$|^[0-9]{14}$');
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS seller_address text CHECK (seller_address IS NULL OR length(seller_address) BETWEEN 5 AND 200);
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS seller_doc_public text GENERATED ALWAYS AS (
    CASE WHEN seller_doc_type = 'cnpj' AND seller_doc ~ '^[0-9]{14}$'
              THEN substr(seller_doc, 1, 2) || '.' || substr(seller_doc, 3, 3) || '.' || substr(seller_doc, 6, 3) || '/' || substr(seller_doc, 9, 4) || '-' || substr(seller_doc, 13, 2)
         WHEN seller_doc_type = 'cpf' AND seller_doc ~ '^[0-9]{11}$'
              THEN '***.' || substr(seller_doc, 4, 3) || '.' || substr(seller_doc, 7, 3) || '-**'
    END) STORED;

DO $$
DECLARE seller_cols text[] := ARRAY['seller_name', 'seller_doc_type', 'seller_doc_public', 'seller_address'];
        cols text;
BEGIN
    SELECT string_agg(quote_ident(x), ', ') INTO cols FROM unnest(seller_cols) x;
    EXECUTE format('GRANT SELECT (%s) ON public.stores TO anon, authenticated', cols);
END $$;
-- seller_doc: SEM grant (privado). Nenhuma das colunas é gravável direto: só set_store_seller.

CREATE OR REPLACE FUNCTION public.set_store_seller(p_store uuid, p_name text, p_doc_type text, p_doc text, p_address text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_doc text := regexp_replace(COALESCE(p_doc, ''), '[^0-9]', '', 'g');
        v_name text := NULLIF(btrim(COALESCE(p_name, '')), ''); v_addr text := NULLIF(btrim(COALESCE(p_address, '')), '');
BEGIN
    IF uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store AND owner_id = uid) THEN
        RAISE EXCEPTION 'Só o dono da loja muda estes dados' USING ERRCODE = '42501';
    END IF;
    IF v_name IS NULL OR length(v_name) < 2 OR length(v_name) > 120 THEN RAISE EXCEPTION 'Escreva o nome ou a razão social (2 a 120 letras)' USING ERRCODE = '22023', HINT = 'seller_name'; END IF;
    IF p_doc_type NOT IN ('cpf', 'cnpj') THEN RAISE EXCEPTION 'Escolha CPF ou CNPJ' USING ERRCODE = '22023', HINT = 'seller_doc_type'; END IF;
    IF NOT public._doc_valid(p_doc_type, v_doc) THEN RAISE EXCEPTION '% inválido: confira os números', upper(p_doc_type) USING ERRCODE = '22023', HINT = 'seller_doc'; END IF;
    IF v_addr IS NULL OR length(v_addr) < 5 OR length(v_addr) > 200 THEN RAISE EXCEPTION 'Escreva o endereço (5 a 200 letras)' USING ERRCODE = '22023', HINT = 'seller_address'; END IF;
    UPDATE public.stores SET seller_name = v_name, seller_doc_type = p_doc_type, seller_doc = v_doc, seller_address = v_addr WHERE id = p_store;
    RETURN jsonb_build_object('ok', true, 'doc_public', (SELECT seller_doc_public FROM public.stores WHERE id = p_store));
END; $$;
REVOKE ALL ON FUNCTION public.set_store_seller(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_store_seller(uuid, text, text, text, text) TO authenticated, service_role;

-- o dono lê o número inteiro (para editar)
CREATE OR REPLACE FUNCTION public.get_store_seller(p_store uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT jsonb_build_object('name', seller_name, 'doc_type', seller_doc_type, 'doc', seller_doc, 'address', seller_address, 'doc_public', seller_doc_public)
      FROM public.stores WHERE id = p_store AND owner_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.get_store_seller(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_seller(uuid) TO authenticated, service_role;
