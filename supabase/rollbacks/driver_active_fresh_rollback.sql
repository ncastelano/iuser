-- Desfaz 20261130000123: volta o selo ao valor de driver_mode_active (sem checar a posição).
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
