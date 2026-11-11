-- PIX DO MOTORISTA PARA O PASSAGEIRO (corrida de passageiro paga por Pix).
-- A chave do motorista (driver_payout_keys, privada) passa a servir também à corrida: o passageiro que escolheu PAGAR POR PIX
--   * enquanto escolhe, sabe QUAIS candidatos têm Pix cadastrado (só sim/não, nunca a chave);
--   * depois de escolher o motorista, vê a chave dele para pagar (até 1 dia depois de pedir).
-- O iUser não movimenta esse dinheiro: o passageiro paga direto ao motorista. Entrega de loja fica de fora (lá quem paga é a loja).
-- Ninguém mais lê a chave: nem outros candidatos, nem quem não pediu a corrida, nem anon.

COMMENT ON COLUMN public.driver_payout_keys.consent_at IS
  'Quando o motorista salvou a chave. Ao salvar ele autoriza mostrá-la: (1) ao passageiro que o escolheu e paga por Pix; (2) à loja da entrega que ele aceitou, para pagar o frete.';

CREATE OR REPLACE FUNCTION public.get_ride_applicants_pix(p_ride uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
    SELECT a.applicant_id
      FROM public.ride_requests r
      JOIN public.ride_applications a ON a.ride_request_id = r.id
      JOIN public.driver_payout_keys k ON k.driver_id = a.applicant_id
     WHERE r.id = p_ride AND r.requester_id = auth.uid() AND r.order_id IS NULL AND r.payment_method = 'pix';
$$;

CREATE OR REPLACE FUNCTION public.get_ride_driver_pix(p_ride uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record; k record;
BEGIN
    SELECT id, driver_id, status, payment_method, created_at INTO r FROM public.ride_requests
     WHERE id = p_ride AND requester_id = auth.uid() AND order_id IS NULL;
    IF r.id IS NULL OR r.driver_id IS NULL OR r.payment_method IS DISTINCT FROM 'pix'
       OR r.status NOT IN ('accepted', 'completed') OR r.created_at < now() - interval '1 day' THEN
        RETURN NULL;
    END IF;
    SELECT pix_key_type, pix_key INTO k FROM public.driver_payout_keys WHERE driver_id = r.driver_id;
    IF k.pix_key IS NULL THEN RETURN jsonb_build_object('registered', false); END IF;
    RETURN jsonb_build_object('registered', true, 'type', k.pix_key_type, 'key', k.pix_key);
END;
$$;

REVOKE ALL ON FUNCTION public.get_ride_applicants_pix(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ride_driver_pix(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ride_applicants_pix(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ride_driver_pix(uuid) TO authenticated;
