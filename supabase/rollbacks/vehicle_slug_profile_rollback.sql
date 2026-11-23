-- desfaz 20261130000111: volta o endereço anterior de cada veículo (o último guardado) e a regra antiga (modelo + placa)
UPDATE public.driver_vehicles SET vehicle_slug = old_slugs[array_length(old_slugs, 1)] WHERE array_length(old_slugs, 1) > 0;
CREATE OR REPLACE FUNCTION public._build_vehicle_slug(p_model text, p_plate text, p_kind text, p_driver uuid, p_vehicle uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_base text; v_try text; n int := 1; v_prof text;
BEGIN
    v_base := public._slugify(coalesce(p_model, '') || ' ' || coalesce(p_plate, ''));
    IF v_base IS NULL OR v_base = '' THEN
        SELECT "profileSlug" INTO v_prof FROM public.profiles WHERE id = p_driver;
        v_base := public._slugify(coalesce(v_prof, 'motorista') || ' ' || coalesce(p_kind, 'veiculo'));
    END IF;
    IF v_base = '' THEN v_base := 'veiculo'; END IF;
    v_try := v_base;
    WHILE public._slug_taken(v_try, p_vehicle) LOOP n := n + 1; v_try := left(v_base, 56) || '-' || n; END LOOP;
    RETURN v_try;
END; $function$;
ALTER TABLE public.driver_vehicles DROP COLUMN IF EXISTS old_slugs;
