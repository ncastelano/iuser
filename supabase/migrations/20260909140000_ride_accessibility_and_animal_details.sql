-- Acessibilidade: o campo "necessidade especial" era só um toggle + texto
-- livre. Agora vira perguntas específicas (cadeirante, tipo de cadeira,
-- deficiência visual, cão-guia) — o texto livre continua existindo pra
-- qualquer outra necessidade não coberta pelas opções estruturadas.
alter table ride_requests
    add column if not exists special_needs_wheelchair boolean default false,
    add column if not exists special_needs_wheelchair_type text
        check (special_needs_wheelchair_type in ('dobravel', 'grande')),
    add column if not exists special_needs_visual_impairment boolean default false,
    add column if not exists has_guide_dog boolean default false;

-- Transporte de animal: faixa de peso (afeta se cabe/qual porte de caixa) e
-- confirmação de que será usada uma caixa de transporte apropriada.
alter table ride_requests
    add column if not exists pet_weight_range text
        check (pet_weight_range in ('ate_5kg', '5_a_15kg', '15_a_30kg', 'acima_30kg')),
    add column if not exists pet_has_carrier boolean;

comment on column ride_requests.has_guide_dog is
    'Cão-guia de acompanhamento — não é "pet" pra fins de cobrança/porte/caixa de transporte, é equipamento de acessibilidade.';
