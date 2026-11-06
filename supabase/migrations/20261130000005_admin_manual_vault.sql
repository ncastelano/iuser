-- Cofre do MANUAL DE REGRAS do iUser (só o administrador geral lê).
--
-- O texto do manual NÃO fica no repositório nem no código que o navegador baixa: mora aqui, CIFRADO pelo servidor (AES-256-GCM, chave fora do banco),
-- e só é lido por rotas do servidor que exigem (1) o login do administrador geral, (2) um aparelho confiável cadastrado com digital/rosto (passkey / WebAuthn)
-- e (3) uma sessão curta desse aparelho. NENHUMA destas tabelas tem política nem permissão para anon/authenticated: só a service role (o servidor) acessa.
--
--   admin_trusted_devices     aparelhos cadastrados (chave pública da passkey, nome, último uso). Novo aparelho só entra com aprovação de um já cadastrado.
--   admin_webauthn_challenges desafios de uso único (registrar, entrar, aprovar) e os PEDIDOS de cadastro de aparelho novo
--   admin_manual_chapters     um capítulo por linha (id opaco; título, seções e texto vão cifrados em payload_enc)
--   admin_manual_access_log   quem leu o quê, de qual aparelho e quando (e as tentativas que falharam)

CREATE TABLE IF NOT EXISTS public.admin_trusted_devices (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    credential_id text NOT NULL UNIQUE,
    public_key    text NOT NULL,
    counter       bigint NOT NULL DEFAULT 0,
    transports    text[],
    label         text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
    user_agent    text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_used_at  timestamptz,
    last_ip       text,
    approved_by   uuid REFERENCES public.admin_trusted_devices(id) ON DELETE SET NULL,
    revoked_at    timestamptz
);
CREATE INDEX IF NOT EXISTS admin_trusted_devices_profile_idx ON public.admin_trusted_devices (profile_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.admin_webauthn_challenges (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('register', 'auth', 'approve', 'enroll')),
    challenge  text,
    payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
CREATE INDEX IF NOT EXISTS admin_webauthn_challenges_exp_idx ON public.admin_webauthn_challenges (expires_at);

CREATE TABLE IF NOT EXISTS public.admin_manual_chapters (
    id          text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{16}$'),
    position    integer NOT NULL,
    payload_enc text NOT NULL,
    version     integer NOT NULL DEFAULT 1,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_manual_access_log (
    id         bigserial PRIMARY KEY,
    profile_id uuid,
    device_id  uuid,
    action     text NOT NULL,
    chapter_id text,
    ip         text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_manual_access_log_idx ON public.admin_manual_access_log (created_at DESC);

ALTER TABLE public.admin_trusted_devices     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_webauthn_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_manual_chapters     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_manual_access_log   ENABLE ROW LEVEL SECURITY;

-- Sem política e sem permissão: nem o administrador logado lê pelo app; só o servidor (service role)
REVOKE ALL ON public.admin_trusted_devices, public.admin_webauthn_challenges, public.admin_manual_chapters, public.admin_manual_access_log FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.admin_manual_access_log_id_seq FROM anon, authenticated;
GRANT ALL ON public.admin_trusted_devices, public.admin_webauthn_challenges, public.admin_manual_chapters, public.admin_manual_access_log TO service_role;
GRANT ALL ON SEQUENCE public.admin_manual_access_log_id_seq TO service_role;
