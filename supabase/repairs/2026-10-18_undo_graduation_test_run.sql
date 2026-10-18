-- REPARO do teste graduation_scenarios.sql rodado por engano sem BEGIN/ROLLBACK em 2026-10-18 03:42:48.227414+00.
-- Tudo numa transação só (DO block): ou desfaz tudo ou nada. Cada linha apagada/alterada tem backup local.
DO $R$
DECLARE
  ts constant timestamptz := '2026-10-18 03:42:48.227414+00';
  n int; r text := '';
  pool uuid[];
BEGIN
  -- 1) upline_id dos 29 figurantes volta ao que o livro-caixa de convites mostra (nenhum evento antigo = sem indicador)
  SELECT array_agg(id) INTO pool FROM (
    SELECT id FROM public.profiles
     WHERE id NOT IN ('3f156f12-88dd-42e0-b12c-0aecc1291083', 'd0f95fe9-8707-4193-bb6e-96a3323db0b3')
     ORDER BY created_at LIMIT 29) x;
  ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_upline;
  ALTER TABLE public.profiles DISABLE TRIGGER profiles_notify_invite;
  ALTER TABLE public.profiles DISABLE TRIGGER profiles_points_invite;
  ALTER TABLE public.profiles DISABLE TRIGGER profiles_referral_level;
  UPDATE public.profiles p
     SET upline_id = (SELECT e.profile_id FROM public.profile_points_events e
                       WHERE e.action = 'invite_signup' AND e.ref = p.id::text AND e.created_at < ts - interval '1 hour'
                       ORDER BY e.created_at LIMIT 1)
   WHERE p.id = ANY (pool);
  GET DIAGNOSTICS n = ROW_COUNT; r := r || 'uplines restaurados='||n||E'\n';
  ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_upline;
  ALTER TABLE public.profiles ENABLE TRIGGER profiles_notify_invite;
  ALTER TABLE public.profiles ENABLE TRIGGER profiles_points_invite;
  ALTER TABLE public.profiles ENABLE TRIGGER profiles_referral_level;

  -- 2) dinheiro de teste na carteira/comissões
  DELETE FROM public.wallet_transactions WHERE created_at = ts AND source_payment_id IN ('T9-A','T9-B'); GET DIAGNOSTICS n = ROW_COUNT; r := r || 'carteira='||n||E'\n'; IF n <> 2 THEN RAISE EXCEPTION 'carteira esperado 2, achei %', n; END IF;
  DELETE FROM public.commissions WHERE created_at = ts AND transaction_id IN ('T9-A','T9-B'); GET DIAGNOSTICS n = ROW_COUNT; r := r || 'comissoes='||n||E'\n'; IF n <> 2 THEN RAISE EXCEPTION 'comissoes esperado 2, achei %', n; END IF;

  -- 3) pontos: remove os eventos do teste e refaz o total a partir do livro-caixa
  DELETE FROM public.profile_notifications WHERE created_at = ts AND kind = 'invite_signup'; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'notificacoes='||n||E'\n'; IF n <> 26 THEN RAISE EXCEPTION 'notificacoes esperado 26, achei %', n; END IF;
  DELETE FROM public.profile_points_events WHERE created_at = ts; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'eventos de pontos='||n||E'\n'; IF n <> 26 THEN RAISE EXCEPTION 'eventos esperado 26, achei %', n; END IF;
  UPDATE public.profile_points pp SET total = COALESCE((SELECT sum(points)::integer FROM public.profile_points_events e WHERE e.profile_id = pp.profile_id), 0)
   WHERE pp.updated_at = ts; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'totais de pontos='||n||E'\n'; IF n <> 3 THEN RAISE EXCEPTION 'totais esperado 3, achei %', n; END IF;

  -- 4) níveis/histórico/logs/estado da rede criados pelo teste
  DELETE FROM public.user_network_state WHERE updated_at = ts AND level_achieved_at = ts; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'estado da rede='||n||E'\n'; IF n <> 3 THEN RAISE EXCEPTION 'estado esperado 3, achei %', n; END IF;
  DELETE FROM public.user_level_history WHERE created_at = ts; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'historico de nivel='||n||E'\n'; IF n <> 6 THEN RAISE EXCEPTION 'historico esperado 6, achei %', n; END IF;
  DELETE FROM public.system_logs WHERE created_at = ts; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'system_logs='||n||E'\n'; IF n <> 13 THEN RAISE EXCEPTION 'logs esperado 13, achei %', n; END IF;
  DELETE FROM public.network_levels WHERE name = 'Platina' AND created_at = ts; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'nivel Platina='||n||E'\n'; IF n <> 1 THEN RAISE EXCEPTION 'Platina esperado 1, achei %', n; END IF;
  UPDATE public.network_levels SET commission_prepaid_bp = 6000 WHERE name = 'Ouro' AND commission_prepaid_bp = 6500; GET DIAGNOSTICS n = ROW_COUNT; r := r || 'Ouro de volta a 60%='||n||E'\n'; IF n <> 1 THEN RAISE EXCEPTION 'Ouro esperado 1, achei %', n; END IF;
  UPDATE public.network_levels SET updated_at = created_at WHERE updated_at = ts;

  -- 5) conferência final (o que o usuário viu)
  r := r || 'gessiane: filhos=' || (SELECT count(*) FROM public.profiles WHERE upline_id = '8dae0c41-55b1-42e7-ba9c-6162e40af595')
         || ' pontos=' || (SELECT total FROM public.profile_points WHERE profile_id = '8dae0c41-55b1-42e7-ba9c-6162e40af595')
         || ' carteira(fernando)=' || (SELECT coalesce(sum(amount),0) FROM public.wallet_transactions WHERE user_id = 'fb65a2d2-d861-4d2d-afc8-59a75fbd331b')
         || ' niveis=' || (SELECT string_agg(name||':'||commission_prepaid_bp, ',' ORDER BY level_order) FROM public.network_levels)
         || ' perfis com upline=' || (SELECT count(*) FROM public.profiles WHERE upline_id IS NOT NULL);
  IF current_setting('app.repair_dry_run', true) = '1' THEN RAISE EXCEPTION 'RESULT (ensaio, desfeito): %', r; END IF;
  RAISE NOTICE '%', r;
END $R$;
