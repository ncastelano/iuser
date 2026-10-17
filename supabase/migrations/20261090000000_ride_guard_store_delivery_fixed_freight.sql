-- Etapa 1.5 / Grupo B (complemento): na entrega de loja o frete é fixo; o motorista não soma "tarefa extra".
-- Só recria a função de guarda de UPDATE (a 20261087 fica intacta) com essa regra a mais.
CREATE OR REPLACE FUNCTION public.guard_ride_requests_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    uid uuid := auth.uid();
    is_req boolean := (uid IS NOT NULL AND uid = OLD.requester_id);
    is_drv boolean := (uid IS NOT NULL AND OLD.driver_id IS NOT NULL AND uid = OLD.driver_id);
    allowed text[] := '{}';
    expected text;
BEGIN
    IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
    IF NOT (is_req OR is_drv) THEN
        RAISE EXCEPTION 'Sem permissão para alterar esta corrida' USING ERRCODE = '42501';
    END IF;

    -- Colunas que cada papel pode mexer. Todo o resto (preço, loja, pedido, motorista, endereços...) é do servidor.
    IF is_req THEN allowed := allowed || ARRAY['status', 'cancelled_by']; END IF;
    IF is_drv THEN
        allowed := allowed || ARRAY['status', 'cancelled_by', 'driver_en_route', 'driver_departed_at', 'driver_arrived_at',
                                    'ride_started_at', 'stop1_reached_at', 'stop2_reached_at',
                                    'extra_task_minutes', 'extra_task_fee', 'extra_task_description'];
    END IF;
    IF (to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed) THEN
        RAISE EXCEPTION 'Campo protegido: só o servidor altera preço, vínculos e dados da corrida' USING ERRCODE = '42501';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
        -- A única mudança de status direta é cancelar; aceitar e concluir têm função própria.
        IF NEW.status = 'cancelled' AND OLD.status IN ('pending', 'accepted') THEN
            expected := CASE WHEN is_req THEN 'requester' ELSE 'driver' END;
            IF NEW.cancelled_by IS DISTINCT FROM expected THEN
                RAISE EXCEPTION 'cancelled_by inválido' USING ERRCODE = '42501';
            END IF;
            IF NOT is_req AND OLD.status <> 'accepted' THEN
                RAISE EXCEPTION 'O motorista só cancela corrida que aceitou' USING ERRCODE = '42501';
            END IF;
        ELSE
            RAISE EXCEPTION 'Mudança de status não permitida por aqui (use a operação própria: aceitar, concluir ou cancelar)' USING ERRCODE = '42501';
        END IF;
    ELSIF NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by THEN
        RAISE EXCEPTION 'cancelled_by só muda ao cancelar' USING ERRCODE = '42501';
    END IF;

    -- Entrega de loja tem frete FIXO: o motorista não registra "tarefa extra" (valor a mais) nela
    IF OLD.order_id IS NOT NULL
       AND (NEW.extra_task_minutes, NEW.extra_task_fee, NEW.extra_task_description)
           IS DISTINCT FROM (OLD.extra_task_minutes, OLD.extra_task_fee, OLD.extra_task_description) THEN
        RAISE EXCEPTION 'O frete de entrega de loja é fixo: não aceita tarefa extra' USING ERRCODE = '42501';
    END IF;

    -- Etapas do motorista só existem com a corrida aceita, e uma vez gravadas não são reescritas.
    IF (NEW.driver_en_route, NEW.driver_departed_at, NEW.driver_arrived_at, NEW.ride_started_at, NEW.stop1_reached_at, NEW.stop2_reached_at,
        NEW.extra_task_minutes, NEW.extra_task_fee, NEW.extra_task_description)
       IS DISTINCT FROM
       (OLD.driver_en_route, OLD.driver_departed_at, OLD.driver_arrived_at, OLD.ride_started_at, OLD.stop1_reached_at, OLD.stop2_reached_at,
        OLD.extra_task_minutes, OLD.extra_task_fee, OLD.extra_task_description) THEN
        IF OLD.status <> 'accepted' THEN
            RAISE EXCEPTION 'Etapas da corrida só podem ser registradas com a corrida aceita' USING ERRCODE = '42501';
        END IF;
        IF (OLD.driver_departed_at IS NOT NULL AND NEW.driver_departed_at IS DISTINCT FROM OLD.driver_departed_at)
           OR (OLD.driver_arrived_at IS NOT NULL AND NEW.driver_arrived_at IS DISTINCT FROM OLD.driver_arrived_at)
           OR (OLD.ride_started_at IS NOT NULL AND NEW.ride_started_at IS DISTINCT FROM OLD.ride_started_at)
           OR (OLD.stop1_reached_at IS NOT NULL AND NEW.stop1_reached_at IS DISTINCT FROM OLD.stop1_reached_at)
           OR (OLD.stop2_reached_at IS NOT NULL AND NEW.stop2_reached_at IS DISTINCT FROM OLD.stop2_reached_at) THEN
            RAISE EXCEPTION 'Etapa já registrada não pode ser alterada' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
