-- Table for native push tokens (FCM/APNs, one row per install of the Capacitor app)
CREATE TABLE IF NOT EXISTS public.native_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.native_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own native push tokens"
ON public.native_push_tokens FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS native_push_tokens_user_idx ON public.native_push_tokens(user_id);

CREATE TRIGGER on_native_push_token_updated
BEFORE UPDATE ON public.native_push_tokens
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
