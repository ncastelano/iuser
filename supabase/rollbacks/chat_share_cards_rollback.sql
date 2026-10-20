-- Desfaz 20261111000000_chat_share_cards.sql (mensagens que citavam loja/perfil/produto em comunidade perdem o cartão; o texto fica).
DROP FUNCTION IF EXISTS public.search_share_targets(text, text, int);
DROP FUNCTION IF EXISTS public.get_share_cards(uuid[], uuid[], uuid[]);
ALTER TABLE public.community_messages DROP CONSTRAINT IF EXISTS community_messages_one_ref;
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_one_ref;
ALTER TABLE public.community_messages DROP COLUMN IF EXISTS ref_product_id, DROP COLUMN IF EXISTS ref_store_id, DROP COLUMN IF EXISTS ref_profile_id;
ALTER TABLE public.direct_messages DROP COLUMN IF EXISTS ref_store_id, DROP COLUMN IF EXISTS ref_profile_id;
