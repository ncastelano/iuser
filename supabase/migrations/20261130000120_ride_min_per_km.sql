-- Piso POR QUILÔMETRO da corrida de passageiro: nenhuma tarifa (a da plataforma ou a do motorista) deixa a corrida
-- abaixo de R$ 2,00 por km. Junto com o piso por hora (R$ 40/h) e o mínimo da corrida (R$ 8), vale o MAIOR dos três.
-- Ex.: tarifa do motorista com base R$ 7 e franquia de 70 km: 10 km sairiam por R$ 7; o piso leva a R$ 20.
-- O valor fica em ride_negotiation_settings.min_per_km (sem tela: alterar por SQL). Rollback: supabase/rollbacks/ride_min_per_km_rollback.sql.

ALTER TABLE public.ride_negotiation_settings
    ADD COLUMN IF NOT EXISTS min_per_km numeric(6,2) NOT NULL DEFAULT 2
    CONSTRAINT rns_min_per_km_check CHECK (min_per_km >= 0 AND min_per_km <= 50);

CREATE OR REPLACE FUNCTION public._ride_min_per_km() RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT min_per_km FROM public.ride_negotiation_settings), 2) $$;

-- O piso da corrida agora também considera os km (ver comentário no topo). Entrega de loja (order_id) segue fora: frete fixo.
CREATE OR REPLACE FUNCTION public._ride_trip_floor(p_ride uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT CASE WHEN r.order_id IS NOT NULL THEN 0
                ELSE GREATEST(
                    ceil(COALESCE(r.duration_min, r.distance_km / 40.0 * 60.0, 0) * public._ride_min_per_minute() * 100) / 100,
                    public._ride_min_fare(),
                    ceil(COALESCE(r.distance_km, 0) * public._ride_min_per_km() * 100) / 100
                ) END
    FROM public.ride_requests r WHERE r.id = p_ride;
$function$;
