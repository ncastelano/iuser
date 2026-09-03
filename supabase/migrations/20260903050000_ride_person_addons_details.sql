-- Detalhes dos adicionais da etapa "Mais alguém vai?": compras de
-- mercado (quantas sacolas), o objeto extra que vai junto com a
-- pessoa (qual é + foto) e o pet que vai junto (qual é + foto).
ALTER TABLE public.ride_requests
    ADD COLUMN is_grocery_shopping BOOLEAN,
    ADD COLUMN bag_count INT,
    ADD COLUMN extra_object_description TEXT,
    ADD COLUMN extra_object_photo_url TEXT,
    ADD COLUMN pet_description TEXT,
    ADD COLUMN pet_photo_url TEXT;
