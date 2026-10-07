-- Moldura esmeralda animada no avatar de quem usa o plano Pré-pago (inclui o brinde de 90 dias
-- e qualquer concessão: pago, código, admin, liderança). Também vale pra todos os níveis da
-- hierarquia (do administrador pra baixo), com plano ou sem.
--
-- O avatar aparece pra qualquer um (inclusive visitante), mas a tabela de assinaturas é privada,
-- então a pergunta "quais destes usuários têm a moldura?" é respondida por esta função
-- SECURITY DEFINER, que devolve só os ids (nenhum dado de plano vaza).
CREATE OR REPLACE FUNCTION public.get_plan_ring_users(p_ids uuid[])
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
    SELECT p.id
    FROM public.profiles p
    WHERE p.id = ANY (p_ids[1:200])
      AND (
          -- Administrador geral
          EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id AND u.email = 'ncastelano@gmail.com')
          -- Qualquer posição da hierarquia (do administrador pra baixo), tenha plano ou não
          OR EXISTS (SELECT 1 FROM public.user_statuses s WHERE s.id = p.status_id AND s.is_active)
          -- Pré-pago ativo (pago, brinde, código, concedido)
          OR EXISTS (
              SELECT 1 FROM public.subscriptions sub
              JOIN public.plans pl ON pl.id = sub.plan_id
              WHERE sub.user_id = p.id AND pl.code = 'pre_pago' AND sub.status = 'active'
                AND (sub.starts_at IS NULL OR sub.starts_at <= now())
                AND sub.current_period_end > now()
          )
      );
$$;

REVOKE ALL ON FUNCTION public.get_plan_ring_users(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.get_plan_ring_users(uuid[]) TO anon, authenticated, service_role;
