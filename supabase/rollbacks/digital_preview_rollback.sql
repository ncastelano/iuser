-- Desfaz 20261130000016_digital_preview.sql: remove a prévia curta e volta as funções da 14/15 (reaplique-as depois, se precisar)
DELETE FROM public.digital_contents WHERE is_teaser;
ALTER TABLE public.digital_contents DROP CONSTRAINT IF EXISTS digital_contents_teaser_check;
ALTER TABLE public.digital_contents DROP COLUMN IF EXISTS is_teaser;
DROP FUNCTION IF EXISTS public.get_digital_showcase(integer, text);
-- depois: reaplicar get_digital_curriculum/get_digital_item_access/get_my_digital_library (20261130000014) e get_digital_showcase (20261130000015)
