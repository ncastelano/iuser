-- "Animal" vira um terceiro tipo de pedido (ao lado de pessoa/objeto), pra
-- quando só o bicho precisa ser levado, sem passageiro humano junto — reusa
-- as colunas pet_description/pet_photo_url e as de remetente/destinatário
-- que já existiam pro fluxo de objeto.
ALTER TABLE public.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_ride_type_check;
ALTER TABLE public.ride_requests ADD CONSTRAINT ride_requests_ride_type_check
    CHECK (ride_type IN ('pessoa', 'objeto', 'animal'));

-- child_age era um INT (uma idade só). Com várias crianças cada uma pode
-- ter uma idade diferente, então vira texto livre (ex: "5 e 8 anos") e
-- ganha children_count pra quantidade.
ALTER TABLE public.ride_requests DROP CONSTRAINT IF EXISTS ride_requests_child_age_check;
ALTER TABLE public.ride_requests ALTER COLUMN child_age TYPE TEXT USING child_age::text;

ALTER TABLE public.ride_requests
    ADD COLUMN children_count INT CHECK (children_count >= 1 AND children_count <= 10);
