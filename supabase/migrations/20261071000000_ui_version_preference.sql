-- Versão da interface (2.0 / 3.0) escolhida pela pessoa. É SÓ apresentação: não mexe em dados, permissões, planos ou saldos.
--   * profiles.preferred_version: 'v2' | 'v3'; NULL = ainda não escolheu (vale a versão padrão).
--   * set_my_ui_version(): a pessoa troca só a PRÓPRIA preferência, sem depender da política geral de UPDATE em profiles
--     (assim a troca de interface não precisa de permissão de escrita em nenhuma outra coluna).
--   * feature_flags.ui_v3: o admin liga/desliga a oferta da versão 3.0 (desligada, todos ficam na 2.0).

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_version text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_preferred_version_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_preferred_version_check CHECK (preferred_version IS NULL OR preferred_version IN ('v2', 'v3'));

CREATE OR REPLACE FUNCTION public.set_my_ui_version(p_version text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated';
    END IF;
    IF p_version IS NOT NULL AND p_version NOT IN ('v2', 'v3') THEN
        RAISE EXCEPTION 'invalid version';
    END IF;
    UPDATE public.profiles SET preferred_version = p_version WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_ui_version(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_ui_version(text) TO authenticated;

INSERT INTO public.feature_flags (key, enabled) VALUES ('ui_v3', true) ON CONFLICT (key) DO NOTHING;
