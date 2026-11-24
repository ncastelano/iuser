-- desfaz 20261130000118: as funções voltam às originais (o gatilho de push volta pela migration 20261130000074)
DROP TRIGGER IF EXISTS a_digital_claims_private_store ON public.digital_claims;
DROP FUNCTION IF EXISTS public.private_store_claim_guard();
DROP FUNCTION IF EXISTS public.get_club_info(uuid);
DROP FUNCTION IF EXISTS public.get_share_cards(uuid[], uuid[], uuid[]);
DROP FUNCTION IF EXISTS public.get_digital_curriculum(uuid);
DROP FUNCTION IF EXISTS public.get_digital_audio_preview(uuid);
DROP FUNCTION IF EXISTS public.get_digital_book_preview(uuid);
ALTER FUNCTION public._get_club_info_all(uuid) RENAME TO get_club_info;
ALTER FUNCTION public._get_share_cards_all(uuid[], uuid[], uuid[]) RENAME TO get_share_cards;
ALTER FUNCTION public._get_digital_curriculum_all(uuid) RENAME TO get_digital_curriculum;
ALTER FUNCTION public._get_digital_audio_preview_all(uuid) RENAME TO get_digital_audio_preview;
ALTER FUNCTION public._get_digital_book_preview_all(uuid) RENAME TO get_digital_book_preview;
GRANT EXECUTE ON FUNCTION public.get_club_info(uuid), public.get_share_cards(uuid[], uuid[], uuid[]), public.get_digital_curriculum(uuid), public.get_digital_audio_preview(uuid), public.get_digital_book_preview(uuid) TO anon, authenticated;
