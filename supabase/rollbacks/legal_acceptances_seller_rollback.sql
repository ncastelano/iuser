-- Rollback de 20261130000082: tira os aceites registrados, a trava do modo motorista e "Quem vende" (os dados digitados se perdem).
DROP TRIGGER IF EXISTS driver_pricing_require_declaration ON public.driver_pricing;
DROP FUNCTION IF EXISTS public.driver_pricing_require_declaration();
DROP FUNCTION IF EXISTS public.get_my_legal(uuid);
DROP FUNCTION IF EXISTS public.accept_legal(text, uuid, text);
DROP FUNCTION IF EXISTS public._has_accepted(uuid, text, uuid);
DROP TABLE IF EXISTS public.legal_acceptances;
DROP TABLE IF EXISTS public.legal_documents;
DROP FUNCTION IF EXISTS public.get_store_seller(uuid);
DROP FUNCTION IF EXISTS public.set_store_seller(uuid, text, text, text, text);
ALTER TABLE public.stores DROP COLUMN IF EXISTS seller_doc_public;
ALTER TABLE public.stores DROP COLUMN IF EXISTS seller_doc;
ALTER TABLE public.stores DROP COLUMN IF EXISTS seller_doc_type;
ALTER TABLE public.stores DROP COLUMN IF EXISTS seller_name;
ALTER TABLE public.stores DROP COLUMN IF EXISTS seller_address;
DROP FUNCTION IF EXISTS public._doc_valid(text, text);
