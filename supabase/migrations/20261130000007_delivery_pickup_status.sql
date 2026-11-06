-- Percurso do motorista: antes de pedir o código de retirada, a tela mostra se cada pedido da saída já está PRONTO ("Pronto ✓" / "Em preparo…").
-- O motorista não lê `orders` (RLS: só comprador e loja); esta função devolve SÓ o estado do pedido das corridas que ele mesmo aceitou.
-- Rollback: supabase/rollbacks/delivery_pickup_status_rollback.sql
CREATE OR REPLACE FUNCTION public.get_my_pickup_status(p_rides uuid[]) RETURNS TABLE (ride_id uuid, order_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT r.id, o.status::text
      FROM public.ride_requests r JOIN public.orders o ON o.id = r.order_id
     WHERE r.id = ANY(p_rides) AND r.driver_id = auth.uid() AND r.status = 'accepted';
$$;
REVOKE ALL ON FUNCTION public.get_my_pickup_status(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_pickup_status(uuid[]) TO authenticated;
