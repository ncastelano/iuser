-- 20261130000111_vehicle_slug_profile.sql — o link do veículo passa a ser <@ do motorista>-<modelo> (23/11/2026, decisão do dono):
-- "iuser.com.br/natancastelano-tracker" no lugar de "iuser.com.br/tracker-qtg2e18" (sem placa no endereço).
-- Os links antigos continuam valendo: o endereço anterior fica em driver_vehicles.old_slugs e o proxy redireciona para o novo.
-- Rollback: supabase/rollbacks/vehicle_slug_profile_rollback.sql

ALTER TABLE public.driver_vehicles ADD COLUMN IF NOT EXISTS old_slugs text[] NOT NULL DEFAULT '{}';

-- um endereço antigo não pode ser dado a outro (o link antigo ainda redireciona para o dono dele)
CREATE OR REPLACE FUNCTION public._slug_taken(p_slug text, p_except_vehicle uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT p_slug = ANY (ARRAY[
        'modeloinicial','modoprestador','painel-perfil','painel-loja','veiculo','admin','api','auth','carrinho','login','registro',
        'lojas','conversas','produtos','publicacoes','radar','convite','compromissos','compromisso','social','comunidade',
        'pedir-motorista','solicitar-servico','procurar-servico','aceitar-corridas','painel-motorista','painel-prestador',
        'minhas-corridas','planos','meus-servicos','administrador','perfil','loja','app','cadastro','cadastrar','chamar','entregas'
    ])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE lower("profileSlug") = p_slug)
    OR EXISTS (SELECT 1 FROM public.stores WHERE lower("storeSlug") = p_slug)
    OR EXISTS (SELECT 1 FROM public.driver_vehicles v WHERE (lower(v.vehicle_slug) = p_slug OR p_slug = ANY (v.old_slugs)) AND (p_except_vehicle IS NULL OR v.id <> p_except_vehicle));
$function$;

CREATE OR REPLACE FUNCTION public._build_vehicle_slug(p_model text, p_plate text, p_kind text, p_driver uuid, p_vehicle uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_base text; v_try text; n int := 1; v_prof text;
BEGIN
    SELECT "profileSlug" INTO v_prof FROM public.profiles WHERE id = p_driver;
    -- <@ do motorista>-<modelo> (sem modelo: <@>-<tipo>); a placa não entra no endereço
    v_base := public._slugify(coalesce(v_prof, 'motorista') || ' ' || coalesce(nullif(btrim(coalesce(p_model, '')), ''), p_kind, 'veiculo'));
    IF v_base IS NULL OR v_base = '' THEN v_base := 'veiculo'; END IF;
    v_base := left(v_base, 56);
    v_try := v_base;
    WHILE public._slug_taken(v_try, p_vehicle) LOOP
        n := n + 1;
        v_try := v_base || '-' || n;
    END LOOP;
    RETURN v_try;
END; $function$;

-- os veículos que já existem ganham o endereço novo; o antigo fica guardado para redirecionar
DO $$
DECLARE r record; v_new text;
BEGIN
    FOR r IN SELECT id, driver_id, car_model, car_plate, vehicle_kind, vehicle_slug FROM public.driver_vehicles ORDER BY id LOOP
        v_new := public._build_vehicle_slug(r.car_model, r.car_plate, r.vehicle_kind, r.driver_id, r.id);
        IF r.vehicle_slug IS DISTINCT FROM v_new THEN
            UPDATE public.driver_vehicles
               SET old_slugs = CASE WHEN r.vehicle_slug IS NULL OR r.vehicle_slug = ANY (old_slugs) THEN old_slugs ELSE array_append(old_slugs, r.vehicle_slug) END,
                   vehicle_slug = v_new
             WHERE id = r.id;
        END IF;
    END LOOP;
END $$;
