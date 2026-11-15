-- Desfaz 20261130000021_upload_admin.sql: volta authorize_upload a ser a função de 20261130000020 (sem anotar recusas), remove as leituras do painel e a tabela de recusas.
-- Os arquivos, as autorizações e os bloqueios NÃO são tocados.
DROP FUNCTION IF EXISTS public.admin_upload_denials(integer, integer);
DROP FUNCTION IF EXISTS public.admin_upload_top_owners(text, integer);
DROP FUNCTION IF EXISTS public.admin_upload_overview();

-- o embrulho sai e o núcleo volta ao nome (e às permissões) originais
DROP FUNCTION IF EXISTS public.authorize_upload(text, text, bigint, text, boolean);
ALTER FUNCTION public._authorize_upload_core(text, text, bigint, text, boolean) RENAME TO authorize_upload;
REVOKE ALL ON FUNCTION public.authorize_upload(text, text, bigint, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_upload(text, text, bigint, text, boolean) TO authenticated;

DROP FUNCTION IF EXISTS public._upload_log_denial(uuid, text, text);
DROP TABLE IF EXISTS public.upload_denials;

-- limpeza como na 20261130000020 (só autorizações)
CREATE OR REPLACE FUNCTION public.upload_grants_purge() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
    DELETE FROM public.upload_grants WHERE created_at < now() - interval '8 days';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public.upload_grants_purge() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upload_grants_purge() TO service_role;
