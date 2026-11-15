-- Controle de uploads: ENVIO PELO CLOUDFLARE R2 (docs/CONTROLE-DE-UPLOADS.md, seção 5). Para vídeo, música e arquivos pesados, que não devem gastar a cota de banda e de espaço do Supabase.
--
-- O R2 não tem "dono do arquivo" nem políticas por linha como o Storage do Supabase, então o PORTEIRO é o servidor:
--   1. a rota /api/uploads/r2/sign chama authorize_upload NO BANCO, como a própria pessoa (as mesmas regras de sempre: login, bloqueios, tipo, tamanho, ritmo, cotas), e só então entrega um
--      link de envio curto, para UM caminho e com tipo e tamanho assinados;
--   2. a rota /api/uploads/r2/complete confere o objeto de verdade no R2 (tamanho e tipo reais) e chama register_r2_asset (só serviço), que registra em media_assets e fecha a autorização.
-- Aqui no banco: (a) authorize_upload passa a aceitar tipos do provedor 'r2' (antes devolvia wrong_provider); (b) o tipo 'media_r2' (nasce DESLIGADO: o admin liga em Admin → Uploads depois de
-- conferir o envio de teste); (c) register_r2_asset; (d) a nota do R2 em Admin → Financeiro. O caminho Supabase não muda em nada. A limpeza de arquivos sem uso e a conferência diária
-- só olham o provedor 'supabase': apagar do R2 fica para quando houver um uso real.
-- Rollback: supabase/rollbacks/upload_r2_rollback.sql

-- (a) o núcleo da autorização aceita 'r2'. Edita a definição que está no banco (em vez de copiar a função inteira), só uma vez, e não consulta storage.objects para o que não é do Supabase.
DO $$
DECLARE v_def text;
BEGIN
    v_def := pg_get_functiondef('public._authorize_upload_core(text,text,bigint,text,boolean)'::regprocedure);
    IF position('k.provider <> ''supabase''' IN v_def) > 0 THEN
        v_def := replace(v_def, 'k.provider <> ''supabase''', 'k.provider NOT IN (''supabase'', ''r2'')');
        v_def := replace(v_def, 'FROM storage.objects o WHERE o.bucket_id = p_bucket AND o.name = p_path;', 'FROM storage.objects o WHERE k.provider = ''supabase'' AND o.bucket_id = p_bucket AND o.name = p_path;');
        EXECUTE v_def;
    END IF;
END $$;

-- (b) o tipo do R2: nasce DESLIGADO. Valores iniciais são PROPOSTAS (o plano grátis do R2 inclui 10 GB no total): editáveis em Admin → Uploads.
INSERT INTO public.upload_kinds (kind, label, bucket, provider, max_bytes, mime_types, enabled, note, owner_folder, per_hour_files, per_day_bytes, per_user_bytes, grant_minutes, cleanup_eligible)
VALUES ('media_r2', 'Vídeo e música (R2)', 'iuser-media', 'r2', 209715200,
        ARRAY['video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/webm'], false,
        'Cloudflare R2, bucket privado iuser-media. Enviado pelo servidor autorizado (/api/uploads/r2/*). Ligue só depois de conferir o botão "Testar o R2" em Admin → Uploads (grava, lê e apaga um arquivo de teste com as chaves reais do servidor).',
        true, 10, 1073741824, 2147483648, 60, false)
ON CONFLICT (kind) DO NOTHING;

-- (c) registro do arquivo enviado ao R2. Só o servidor chama (service_role), já com o tamanho e o tipo REAIS lidos do R2. Exige uma autorização válida e não usada para ESSE caminho e essa pessoa.
CREATE OR REPLACE FUNCTION public.register_r2_asset(p_owner uuid, p_kind text, p_key text, p_bytes bigint, p_mime text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    k       public.upload_kinds%ROWTYPE;
    v_grant uuid;
    v_id    uuid;
BEGIN
    SELECT * INTO k FROM public.upload_kinds WHERE kind = p_kind AND provider = 'r2';
    IF NOT FOUND THEN RAISE EXCEPTION 'unknown_kind' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_owner) THEN RAISE EXCEPTION 'unknown_owner' USING ERRCODE = '22023'; END IF;
    IF p_key IS NULL OR split_part(p_key, '/', 1) <> p_owner::text OR p_key !~ '^[A-Za-z0-9._/-]+$' OR p_key ~ '(^|/)\.\.(/|$)' THEN RAISE EXCEPTION 'invalid_key' USING ERRCODE = '22023'; END IF;
    IF p_bytes IS NULL OR p_bytes <= 0 THEN RAISE EXCEPTION 'empty_file' USING ERRCODE = '22023'; END IF;
    IF p_bytes > k.max_bytes THEN RAISE EXCEPTION 'too_large' USING ERRCODE = '22023'; END IF;
    IF k.mime_types IS NOT NULL AND NOT (lower(btrim(COALESCE(p_mime, ''))) = ANY (k.mime_types)) THEN RAISE EXCEPTION 'type_not_allowed' USING ERRCODE = '22023'; END IF;

    SELECT g.id INTO v_grant FROM public.upload_grants g
    WHERE g.profile_id = p_owner AND g.kind = k.kind AND g.bucket = k.bucket AND g.key = p_key AND g.used_at IS NULL AND g.expires_at > now()
    ORDER BY g.created_at DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'no_grant' USING ERRCODE = '42501'; END IF;

    INSERT INTO public.media_assets (owner_id, kind, provider, bucket, key, bytes, mime)
    VALUES (p_owner, k.kind, 'r2', k.bucket, p_key, p_bytes, lower(btrim(p_mime)))
    ON CONFLICT (provider, bucket, key) DO UPDATE
        SET owner_id = EXCLUDED.owner_id, kind = EXCLUDED.kind, bytes = EXCLUDED.bytes, mime = EXCLUDED.mime, state = 'ready', deleted_at = NULL
    RETURNING id INTO v_id;
    UPDATE public.upload_grants SET actual_bytes = p_bytes, used_at = now() WHERE id = v_grant;
    RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.register_r2_asset(uuid, text, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_r2_asset(uuid, text, text, bigint, text) TO service_role;

-- (d) Admin → Financeiro: o R2 foi ativado (03/11/2026). Atualiza a nota do Cloudflare já cadastrado; sem mexer no valor (o admin preenche o custo real).
UPDATE public.service_expenses
SET notes = 'DNS do iuser.com.br desde 02/11/2026 (nameservers meiling.ns.cloudflare.com e west.ns.cloudflare.com; registros CNAME @, www e * para a Vercel, só DNS). R2 ATIVADO em 03/11/2026: bucket privado iuser-media (classe Standard), usado pelo envio de vídeo e música (/api/uploads/r2/*, tipo media_r2). Plano grátis inclui 10 GB, 1 milhão de operações de gravação e 10 milhões de leitura por mês, sem cobrança de saída; acima disso: US$ 0,015 por GB, US$ 4,50 por milhão de gravações, US$ 0,36 por milhão de leituras. Configure um alerta de gasto na Cloudflare. Stream (vídeo hospedado) NÃO ativado. Ver docs/CONTROLE-DE-UPLOADS.md.',
    updated_at = now()
WHERE service_name ILIKE '%cloudflare%' AND notes LIKE '%R2 (arquivos) e Stream (vídeo) ainda NÃO ativados%';
