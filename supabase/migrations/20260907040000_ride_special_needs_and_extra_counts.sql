-- "Para onde ir" ganha uma pergunta sobre necessidade especial do
-- passageiro (no lugar do antigo seletor de rotas alternativas, que foi
-- removido: agora só existe uma rota). E os adicionais "Objeto" e "Pet"
-- da etapa "Detalhes da corrida" viram contadores como os demais
-- (crianças, sacolas de mercado), então passam a guardar a quantidade.
ALTER TABLE public.ride_requests
    ADD COLUMN has_special_needs BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN special_needs_description TEXT,
    ADD COLUMN extra_object_count INT CHECK (extra_object_count >= 1 AND extra_object_count <= 10),
    ADD COLUMN pet_count INT CHECK (pet_count >= 1 AND pet_count <= 10);
