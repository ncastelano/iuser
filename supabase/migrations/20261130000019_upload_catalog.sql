-- Controle de uploads, Camada 2 (docs/CONTROLE-DE-UPLOADS.md): CATÁLOGO de tipos de envio + REGISTRO de tudo que entra.
--
--   upload_kinds : um tipo por linha (avatar, foto de produto, vídeo do Flash, arquivo digital...) com o bucket, o PROVEDOR (supabase | r2 | stream), o tamanho
--                  máximo e os tipos aceitos. É a tabela que o Admin vai editar e o que decide para onde um tipo novo vai. Hoje todos são 'supabase' (1 tipo por bucket);
--                  mudar um tipo para 'r2' (Cloudflare) vira configuração, não reescrita. O limite de verdade continua sendo o do bucket (storage.buckets): um teste
--                  confere que o catálogo e os buckets batem.
--   media_assets : o registro de CADA arquivo (dono, tipo, provedor, chave, bytes, tipo MIME, estado). É a base das cotas por pessoa, do painel e da limpeza de órfãos.
--                  Bytes e MIME vêm do próprio Storage (storage.objects), NUNCA do que o app informa; só o dono do arquivo consegue registrá-lo.
--
-- Os ~39 pontos de envio passam por UM ponto central (lib/supabase/client.ts), que chama register_media_asset depois de cada upload (sem nunca bloquear o envio).
-- Arquivos que já existem entram aqui pelo preenchimento no final; os de dono desconhecido (enviados antes do bloqueio de envio anônimo, 20261106) ficam com owner_id nulo.
-- Tabelas sem acesso do app (tudo por função). Rollback: supabase/rollbacks/upload_catalog_rollback.sql

CREATE TABLE IF NOT EXISTS public.upload_kinds (
    kind        text PRIMARY KEY CHECK (kind ~ '^[a-z][a-z0-9_]{1,40}$'),
    label       text NOT NULL,
    bucket      text NOT NULL,
    provider    text NOT NULL DEFAULT 'supabase' CHECK (provider IN ('supabase', 'r2', 'stream')),
    max_bytes   bigint NOT NULL CHECK (max_bytes > 0),
    mime_types  text[],                                    -- NULL = qualquer tipo
    enabled     boolean NOT NULL DEFAULT true,
    note        text,
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS upload_kinds_bucket_idx ON public.upload_kinds (bucket);
ALTER TABLE public.upload_kinds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.upload_kinds FROM anon, authenticated;
GRANT ALL ON public.upload_kinds TO service_role;

-- um tipo por bucket (o estado de hoje); os valores espelham storage.buckets (20261130000018 e as migrations de flash, provas e digitais)
INSERT INTO public.upload_kinds (kind, label, bucket, max_bytes, mime_types, note)
SELECT v.kind, v.label, v.bucket, v.max_bytes, v.mime_types, v.note
FROM (VALUES
    ('avatar',                'Foto de perfil',             'avatars',                5242880::bigint,   ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif'], NULL),
    ('background',            'Fundo do perfil',            'backgrounds',            5242880::bigint,   ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif'], NULL),
    ('store_logo',            'Logo da loja',               'store-logos',            5242880::bigint,   ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif'], NULL),
    ('product_photo',         'Foto de produto, serviço, publicação ou imóvel', 'product-images', 5242880::bigint, ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif'], NULL),
    ('community_photo',       'Foto de comunidade',         'community-photos',       6291456::bigint,   ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif'], NULL),
    ('service_request_photo', 'Foto de pedido de serviço',  'service-request-photos', 5242880::bigint,   ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif'], NULL),
    ('ride_object_photo',     'Foto do objeto da corrida',  'ride-object-photos',     5242880::bigint,   ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif'], NULL),
    ('driver_car_photo',      'Foto do veículo',            'driver-car-photos',      5242880::bigint,   ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif'], NULL),
    ('driver_selfie',         'Selfie do motorista',        'driver-selfie-photos',   5242880::bigint,   ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif'], NULL),
    ('mural_image',           'Imagem do mural',            'mural-images',           5242880::bigint,   ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif'], 'sem ponto de envio no código hoje'),
    ('post_image',            'Imagem de postagem',         'posts',                  5242880::bigint,   ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif'], 'sem ponto de envio no código hoje'),
    ('store_link_image',      'Imagem de link da loja',     'store-links',            5242880::bigint,   ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif'], 'sem ponto de envio no código hoje'),
    ('flash_media',           'Foto ou vídeo do Flash',     'flash-media',            15728640::bigint,  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'], 'candidato a ir para o R2/Stream quando houver vídeo longo'),
    ('delivery_proof',        'Foto da prova de entrega',   'delivery-proofs',        8388608::bigint,   ARRAY['image/jpeg','image/png','image/webp'], NULL),
    ('digital_file',          'Arquivo de produto digital', 'digital-files',          524288000::bigint, NULL, 'bucket privado; no plano gratuito o teto global é 50 MB por arquivo')
) AS v(kind, label, bucket, max_bytes, mime_types, note)
ON CONFLICT (kind) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.media_assets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,   -- NULL: dono desconhecido (arquivo antigo)
    kind        text NOT NULL REFERENCES public.upload_kinds(kind),
    provider    text NOT NULL DEFAULT 'supabase' CHECK (provider IN ('supabase', 'r2', 'stream')),
    bucket      text NOT NULL,
    key         text NOT NULL,                                            -- caminho do arquivo dentro do bucket (nunca URL completa)
    bytes       bigint NOT NULL DEFAULT 0 CHECK (bytes >= 0),
    mime        text,
    state       text NOT NULL DEFAULT 'ready' CHECK (state IN ('ready', 'deleted')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    deleted_at  timestamptz,
    UNIQUE (provider, bucket, key)
);
CREATE INDEX IF NOT EXISTS media_assets_owner_idx ON public.media_assets (owner_id, kind) WHERE state = 'ready';
CREATE INDEX IF NOT EXISTS media_assets_kind_idx ON public.media_assets (kind, created_at DESC);
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_assets FROM anon, authenticated;
GRANT ALL ON public.media_assets TO service_role;

-- registra um arquivo que a PESSOA acabou de enviar. O tamanho e o tipo saem do Storage; só o dono do arquivo registra. Devolve NULL se o bucket não está no catálogo
-- ou o arquivo não existe (o app nunca trata isso como erro). Repetir é seguro (troca de arquivo no mesmo caminho atualiza o registro).
CREATE OR REPLACE FUNCTION public.register_media_asset(p_bucket text, p_path text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE
    v_uid   uuid := auth.uid();
    v_kind  public.upload_kinds%ROWTYPE;
    v_owner text;
    v_meta  jsonb;
    v_id    uuid;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000'; END IF;
    SELECT * INTO v_kind FROM public.upload_kinds WHERE bucket = p_bucket AND enabled ORDER BY kind LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT o.owner_id, o.metadata INTO v_owner, v_meta FROM storage.objects o WHERE o.bucket_id = p_bucket AND o.name = p_path;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF v_owner IS DISTINCT FROM v_uid::text THEN RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.media_assets (owner_id, kind, provider, bucket, key, bytes, mime)
    VALUES (v_uid, v_kind.kind, v_kind.provider, p_bucket, p_path, COALESCE((v_meta->>'size')::bigint, 0), v_meta->>'mimetype')
    ON CONFLICT (provider, bucket, key) DO UPDATE
        SET owner_id = EXCLUDED.owner_id, kind = EXCLUDED.kind, bytes = EXCLUDED.bytes, mime = EXCLUDED.mime, state = 'ready', deleted_at = NULL
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.register_media_asset(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_media_asset(text, text) TO authenticated;

-- quanto a pessoa já enviou, por tipo (base das cotas por pessoa; só os arquivos dela)
CREATE OR REPLACE FUNCTION public.my_media_usage() RETURNS TABLE (kind text, files bigint, bytes bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT m.kind, count(*)::bigint, COALESCE(sum(m.bytes), 0)::bigint
    FROM public.media_assets m
    WHERE m.owner_id = auth.uid() AND m.state = 'ready'
    GROUP BY m.kind
    ORDER BY m.kind;
$$;
REVOKE ALL ON FUNCTION public.my_media_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_media_usage() TO authenticated;

-- marca como apagado o que sumiu do Storage (limpeza/troca de arquivo feitas por fora do registro). Só serviço; o agendamento (pg_cron) entra na Camada 6.
CREATE OR REPLACE FUNCTION public.media_assets_reconcile() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
DECLARE v_n integer;
BEGIN
    UPDATE public.media_assets m SET state = 'deleted', deleted_at = now()
    WHERE m.state = 'ready' AND m.provider = 'supabase'
      AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = m.bucket AND o.name = m.key);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public.media_assets_reconcile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_assets_reconcile() TO service_role;

-- arquivos que já existem entram no registro (dono nulo quando o dono não é um perfil conhecido)
INSERT INTO public.media_assets (owner_id, kind, provider, bucket, key, bytes, mime, created_at)
SELECT p.id, k.kind, k.provider, o.bucket_id, o.name, COALESCE((o.metadata->>'size')::bigint, 0), o.metadata->>'mimetype', COALESCE(o.created_at, now())
FROM storage.objects o
JOIN public.upload_kinds k ON k.bucket = o.bucket_id
LEFT JOIN public.profiles p ON p.id::text = o.owner_id
WHERE o.name NOT LIKE '%.emptyFolderPlaceholder'
ON CONFLICT (provider, bucket, key) DO NOTHING;

-- Admin → Financeiro (regra do projeto: todo serviço externo entra em service_expenses, mesmo no plano grátis). Só insere se ainda não houver uma linha com esse nome
-- (a produção pode já ter o domínio cadastrado à mão). Custos em 0: o admin preenche o valor real na aba Financeiro.
INSERT INTO public.service_expenses (service_name, category, plan_name, monthly_cost, billing_cycle, billing_url, notes)
SELECT 'Cloudflare', 'DNS / CDN / Mídia', 'Free', 0, 'monthly', 'https://dash.cloudflare.com',
       'DNS do iuser.com.br desde 02/11/2026 (nameservers meiling.ns.cloudflare.com e west.ns.cloudflare.com; registros CNAME @, www e * para a Vercel, só DNS). R2 (arquivos) e Stream (vídeo) ainda NÃO ativados: ativar pede cartão e passa a cobrar por uso acima do grátis. Ver docs/CONTROLE-DE-UPLOADS.md e upload_kinds.provider.'
WHERE NOT EXISTS (SELECT 1 FROM public.service_expenses WHERE service_name ILIKE '%cloudflare%');

INSERT INTO public.service_expenses (service_name, category, plan_name, monthly_cost, billing_cycle, next_due_date, billing_url, notes)
SELECT 'Domínio iuser.com.br (Hostinger)', 'Domínio', 'Registro .br', 0, 'yearly', DATE '2027-08-30', 'https://hpanel.hostinger.com/domains',
       'Registrado pela Hostinger (provedor HSTDOMAINS no Registro.br), renovação automática ligada, vence em 30/08/2027. O DNS NÃO fica mais na Hostinger nem na Vercel: está na Cloudflare. Se o domínio vencer, o site cai.'
WHERE NOT EXISTS (SELECT 1 FROM public.service_expenses WHERE service_name ILIKE '%iuser.com.br%');
