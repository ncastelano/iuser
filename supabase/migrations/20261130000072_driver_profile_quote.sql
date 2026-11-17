-- 20261130000072_driver_profile_quote.sql
--
-- PERFIL DO MOTORISTA (17/11/2026, decisão do dono): a página do perfil do tipo Motorista mostra o mapa de onde ele está (se ele deixou o local
-- visível), as avaliações das pessoas que andaram com ele e UM botão "Solicitar corrida" que já manda o valor que ELE escolheu cobrar:
--   platform = Tarifa iUser (o padrão) · km = a tarifa própria por km · time = a tarifa própria por tempo (R$ por minuto).
--
-- Por que funções: `driver_pricing` só é legível pelo próprio motorista e por quem tem corrida ACEITA com ele (RLS). Antes disso, um visitante
-- do perfil (e da página do veículo) lia NADA e o app caía sempre na Tarifa iUser, mesmo com tarifa própria. Estas funções entregam só o
-- necessário, nunca a posição exata:
--   get_driver_public_quote(motorista) → o modo do botão, os números da tarifa que valem para ele, se está dirigindo e, SÓ para quem está logado e
--     se o motorista deixou o local visível (profiles.show_location), a posição APROXIMADA (grade de ~330 m, a mesma do Radar) de até 10 min;
--   get_driver_reviews(motorista, limite) → as avaliações das corridas (nota, comentário, quem avaliou — nome, @ e foto, como no resto do app —,
--     bairro de partida e chegada), as com comentário primeiro.
-- Rollback: supabase/rollbacks/driver_profile_quote_rollback.sql. Cenários: supabase/tests/driver_profile_quote_scenarios.sql.

ALTER TABLE public.driver_pricing ADD COLUMN IF NOT EXISTS profile_quote text;
DO $$ BEGIN
    ALTER TABLE public.driver_pricing ADD CONSTRAINT driver_pricing_profile_quote_check CHECK (profile_quote IS NULL OR profile_quote IN ('platform', 'km', 'time'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.get_driver_public_quote(p_driver uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
    SELECT jsonb_build_object(
        -- sem escolha: quem usa tarifa própria cobra por km; os outros, a Tarifa iUser
        'mode', COALESCE(dp.profile_quote, CASE WHEN dp.pricing_mode = 'custom' THEN 'km' ELSE 'platform' END),
        'pricing_mode', COALESCE(dp.pricing_mode, 'platform'),
        'base_distance_km', dp.base_distance_km,
        'base_fee', dp.base_fee,
        'price_per_km_after_base', dp.price_per_km_after_base,
        'price_per_minute', dp.price_per_minute,
        'extra_fee_pessoa', dp.extra_fee_pessoa, 'extra_fee_animal', dp.extra_fee_animal, 'extra_fee_objeto', dp.extra_fee_objeto,
        'extra_fee_condominio', dp.extra_fee_condominio, 'extra_fee_compras', dp.extra_fee_compras,
        'extra_fee_necessidade_especial', dp.extra_fee_necessidade_especial, 'extra_fee_pet_sem_caixa', dp.extra_fee_pet_sem_caixa,
        'extra_fee_entrega_interna', dp.extra_fee_entrega_interna, 'extra_fee_ar_condicionado', dp.extra_fee_ar_condicionado,
        'active', COALESCE(dp.driver_mode_active, false),
        'live', CASE
            WHEN (SELECT auth.uid()) IS NOT NULL
             AND COALESCE(p.show_location, true)
             AND COALESCE(dp.driver_mode_active, false) AND COALESCE(dp.live_location_sync, false)
             AND dp.live_lat IS NOT NULL AND dp.live_lng IS NOT NULL
             AND dp.live_updated_at > now() - interval '10 minutes'
            THEN jsonb_build_object('lat', round((dp.live_lat / 0.003)::numeric) * 0.003, 'lng', round((dp.live_lng / 0.003)::numeric) * 0.003, 'at', dp.live_updated_at)
        END
    )
    FROM public.profiles p
    LEFT JOIN public.driver_pricing dp ON dp.driver_id = p.id
    WHERE p.id = p_driver AND COALESCE(p.is_active, true) AND NOT COALESCE(p.is_blocked, false);
$$;
REVOKE ALL ON FUNCTION public.get_driver_public_quote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_public_quote(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_driver_reviews(p_driver uuid, p_limit integer DEFAULT 12)
RETURNS TABLE(rating integer, comment text, rode_at timestamptz, origin text, destination text, reviewer_name text, reviewer_slug text, reviewer_avatar text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
    SELECT rv.rating, NULLIF(btrim(rv.comment), ''), COALESCE(r.ride_started_at, r.created_at),
           COALESCE(public._coarse_address(r.origin_address), 'um local'), COALESCE(public._coarse_address(r.destination_address), 'um local'),
           a.name, a."profileSlug", a.avatar_url
      FROM public.ride_reviews rv
      JOIN public.ride_requests r ON r.id = rv.ride_request_id AND r.driver_id = p_driver AND r.status = 'completed'
      LEFT JOIN public.profiles a ON a.id = rv.reviewer_id AND COALESCE(a.is_active, true) AND NOT COALESCE(a.is_blocked, false)
     WHERE rv.reviewee_id = p_driver
     ORDER BY (NULLIF(btrim(rv.comment), '') IS NULL), COALESCE(r.ride_started_at, r.created_at) DESC
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 12), 30));
$$;
REVOKE ALL ON FUNCTION public.get_driver_reviews(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_driver_reviews(uuid, integer) TO anon, authenticated;
