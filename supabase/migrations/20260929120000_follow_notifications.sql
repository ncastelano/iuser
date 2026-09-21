-- Registro de "novo seguidor" já avisado: cada par (quem seguiu, quem foi
-- seguido) notifica uma única vez, mesmo que a pessoa siga/desfaça/siga de novo.
-- Só o servidor (service role) lê e escreve.
CREATE TABLE IF NOT EXISTS public.follow_notifications (
    follower_id UUID NOT NULL,
    following_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_id, following_id)
);
ALTER TABLE public.follow_notifications ENABLE ROW LEVEL SECURITY;
