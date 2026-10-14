-- Cada veículo cadastrado ganha um endereço próprio (iuser.com.br/<vehicle_slug>), como as lojas: uma pessoa pode ter
-- vários veículos. O endereço é único entre perfis, lojas e veículos (todos vivem na URL de topo).
ALTER TABLE public.driver_vehicles ADD COLUMN IF NOT EXISTS vehicle_slug text;

-- Texto -> slug (sem acento, só a-z 0-9 e hífen, até 60 caracteres)
CREATE OR REPLACE FUNCTION public._slugify(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT left(trim(both '-' from regexp_replace(
        lower(translate(coalesce(p_text, ''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc')),
        '[^a-z0-9]+', '-', 'g')), 60);
$$;

-- Livre = não é rota reservada nem slug de perfil, loja ou outro veículo
CREATE OR REPLACE FUNCTION public._slug_taken(p_slug text, p_except_vehicle uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT p_slug = ANY (ARRAY[
        'modeloinicial','modoprestador','painel-perfil','painel-loja','veiculo','admin','api','auth','carrinho','login','registro',
        'lojas','conversas','produtos','publicacoes','radar','convite','compromissos','compromisso','social','comunidade',
        'pedir-motorista','solicitar-servico','procurar-servico','aceitar-corridas','painel-motorista','painel-prestador',
        'minhas-corridas','planos','meus-servicos','administrador','perfil','loja','app'
    ])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE lower("profileSlug") = p_slug)
    OR EXISTS (SELECT 1 FROM public.stores WHERE lower("storeSlug") = p_slug)
    OR EXISTS (SELECT 1 FROM public.driver_vehicles v WHERE lower(v.vehicle_slug) = p_slug AND (p_except_vehicle IS NULL OR v.id <> p_except_vehicle));
$$;
REVOKE ALL ON FUNCTION public._slug_taken(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._slug_taken(text, uuid) TO service_role;

-- Monta o slug de um veículo: modelo + placa (ex.: tracker-qtg2e18); sem isso, @perfil + tipo. Acrescenta -2, -3... se colidir.
CREATE OR REPLACE FUNCTION public._build_vehicle_slug(p_model text, p_plate text, p_kind text, p_driver uuid, p_vehicle uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_base text; v_try text; n int := 1; v_prof text;
BEGIN
    v_base := public._slugify(coalesce(p_model, '') || ' ' || coalesce(p_plate, ''));
    IF v_base IS NULL OR v_base = '' THEN
        SELECT "profileSlug" INTO v_prof FROM public.profiles WHERE id = p_driver;
        v_base := public._slugify(coalesce(v_prof, 'motorista') || ' ' || coalesce(p_kind, 'veiculo'));
    END IF;
    IF v_base = '' THEN v_base := 'veiculo'; END IF;
    v_try := v_base;
    WHILE public._slug_taken(v_try, p_vehicle) LOOP
        n := n + 1;
        v_try := left(v_base, 56) || '-' || n;
    END LOOP;
    RETURN v_try;
END; $$;

CREATE OR REPLACE FUNCTION public._vehicle_slug_default()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.vehicle_slug IS NULL OR NEW.vehicle_slug = '' THEN
        NEW.vehicle_slug := public._build_vehicle_slug(NEW.car_model, NEW.car_plate, NEW.vehicle_kind, NEW.driver_id, NEW.id);
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS driver_vehicles_slug_default ON public.driver_vehicles;
CREATE TRIGGER driver_vehicles_slug_default BEFORE INSERT ON public.driver_vehicles
    FOR EACH ROW EXECUTE FUNCTION public._vehicle_slug_default();

-- Os veículos que já existem
UPDATE public.driver_vehicles v
   SET vehicle_slug = public._build_vehicle_slug(v.car_model, v.car_plate, v.vehicle_kind, v.driver_id, v.id)
 WHERE v.vehicle_slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS driver_vehicles_vehicle_slug_key ON public.driver_vehicles (lower(vehicle_slug));
