-- Cenários de teste da GRADUAÇÃO. Rode DENTRO de uma transação que termina em ROLLBACK (nada é gravado):
--   begin;  \i este-arquivo  ;  rollback;
-- ou: (echo 'begin;'; cat este-arquivo; echo 'rollback;') | supabase db query --linked -f -
-- Usa perfis reais só como "figurantes" (muda upline_id dentro da transação).

create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default '') returns text language sql as $$
  select (case when p_ok then 'PASS ' else 'FAIL ' end) || p_name || case when p_ok or p_detail = '' then '' else '  -> ' || p_detail end || E'\n'
$$;

create or replace function pg_temp.run() returns text language plpgsql as $f$
declare
  out text := '';
  pool uuid[];
  tester uuid; tester2 uuid; carlos uuid; payer uuid;
  eff jsonb; ov jsonb; r jsonb; n int; lvl uuid; cid uuid;
  ouro uuid; plat uuid; rate_old int; rate_new int; wal numeric;
begin
  -- figurantes: 29 perfis (fora os dois que indicam hoje)
  select array_agg(id) into pool from (
    select id from public.profiles
     where id not in ('3f156f12-88dd-42e0-b12c-0aecc1291083', 'd0f95fe9-8707-4193-bb6e-96a3323db0b3')
     order by created_at limit 29) x;
  tester := pool[1]; tester2 := pool[2]; carlos := pool[3]; payer := pool[4];
  -- todos os figurantes começam sem indicados
  update public.profiles set upline_id = null where id = any (pool);

  -- T1 usuário novo = Inicial 40%
  eff := public.get_effective_commission(tester, 'prepaid');
  out := out || pg_temp.chk('T1 usuário novo é Inicial 40%', eff->>'level' = 'Inicial' and (eff->>'commission_rate_bp')::int = 4000 and eff->>'commission_source' = 'initial_level', eff::text);

  -- T2 chega a Bronze (5 indicados) = 50%
  update public.profiles set upline_id = tester where id = any (pool[5:9]);
  eff := public.get_effective_commission(tester, 'prepaid');
  out := out || pg_temp.chk('T2 5 indicados -> Bronze 50%', eff->>'level' = 'Bronze' and (eff->>'commission_rate_bp')::int = 5000, eff::text);

  -- T2b níveis intermediários: 10 -> Prata 55%, 15 -> Ouro 60%
  update public.profiles set upline_id = tester where id = any (pool[10:14]);
  eff := public.get_effective_commission(tester, 'prepaid');
  out := out || pg_temp.chk('T2b 10 indicados -> Prata 55%', eff->>'level' = 'Prata' and (eff->>'commission_rate_bp')::int = 5500, eff::text);
  update public.profiles set upline_id = tester where id = any (pool[15:19]);
  eff := public.get_effective_commission(tester, 'prepaid');
  out := out || pg_temp.chk('T2c 15 indicados -> Ouro 60%', eff->>'level' = 'Ouro' and (eff->>'commission_rate_bp')::int = 6000, eff::text);

  -- T3 chega a Diamante (20) = 70%
  update public.profiles set upline_id = tester where id = any (pool[20:24]);
  eff := public.get_effective_commission(tester, 'postpaid');
  out := out || pg_temp.chk('T3 20 indicados -> Diamante 70% (pós-pago)', eff->>'level' = 'Diamante' and (eff->>'commission_rate_bp')::int = 7000, eff::text);
  select count(*) into n from public.user_level_history where user_id = tester and change_type = 'automatic_upgrade';
  out := out || pg_temp.chk('T3b histórico guarda cada etapa (Bronze, Prata, Ouro, Diamante)', n = 4, n::text);

  -- T4 perde TODAS as indicações e continua Diamante
  update public.profiles set upline_id = null where id = any (pool[5:24]);
  perform public.check_and_upgrade_user_level(tester);
  eff := public.get_effective_commission(tester, 'prepaid');
  out := out || pg_temp.chk('T4 sem indicações continua Diamante 70%', eff->>'level' = 'Diamante' and (eff->>'commission_rate_bp')::int = 7000, eff::text);
  perform public.recheck_all_levels();
  eff := public.get_effective_commission(tester, 'prepaid');
  out := out || pg_temp.chk('T4b reavaliar todos NÃO rebaixa', eff->>'level' = 'Diamante', eff::text);

  -- T5 admin concede Ouro manualmente a uma conta nova (Inicial)
  select id into ouro from public.network_levels where name = 'Ouro';
  perform public.admin_grant_level('3f156f12-88dd-42e0-b12c-0aecc1291083', carlos, ouro, 'teste');
  eff := public.get_effective_commission(carlos, 'prepaid');
  out := out || pg_temp.chk('T5 concessão manual: Ouro 60%', eff->>'level' = 'Ouro' and (eff->>'commission_rate_bp')::int = 6000 and eff->>'commission_source' = 'manual_level', eff::text);
  select count(*) into n from public.user_level_history where user_id = carlos and change_type = 'manual_grant';
  out := out || pg_temp.chk('T5b concessão registrada no histórico', n = 1, n::text);
  select count(*) into n from public.system_logs where target_user_id = carlos and action = 'level_granted' and actor_id is not null;
  out := out || pg_temp.chk('T5c concessão registrada no log (quem concedeu)', n = 1, n::text);

  -- T6 Bronze com comissão personalizada 63%: continua Bronze, efetiva 63%
  update public.profiles set upline_id = tester2 where id = any (pool[5:9]);
  perform public.admin_set_custom_commission('3f156f12-88dd-42e0-b12c-0aecc1291083', tester2, 6300, null, 'teste');
  eff := public.get_effective_commission(tester2, 'prepaid');
  out := out || pg_temp.chk('T6 Bronze + personalizada 63% (pré) continua Bronze', eff->>'level' = 'Bronze' and (eff->>'commission_rate_bp')::int = 6300 and (eff->>'is_custom')::boolean and eff->>'commission_source' = 'custom', eff::text);
  eff := public.get_effective_commission(tester2, 'postpaid');
  out := out || pg_temp.chk('T6b pós-pago sem personalizada usa o padrão do Bronze 50%', (eff->>'commission_rate_bp')::int = 5000 and not (eff->>'is_custom')::boolean, eff::text);

  -- T7 remove a personalizada: volta ao padrão do Bronze
  perform public.admin_clear_custom_commission('3f156f12-88dd-42e0-b12c-0aecc1291083', tester2, 'teste');
  eff := public.get_effective_commission(tester2, 'prepaid');
  out := out || pg_temp.chk('T7 removida: volta a Bronze 50%', eff->>'level' = 'Bronze' and (eff->>'commission_rate_bp')::int = 5000 and eff->>'commission_source' = 'achieved_level', eff::text);

  -- T7b nível manual + personalizada juntos (Pedro: Ouro + 68%)
  perform public.admin_set_custom_commission('3f156f12-88dd-42e0-b12c-0aecc1291083', carlos, 6800, 6800, 'teste');
  eff := public.get_effective_commission(carlos, 'prepaid');
  out := out || pg_temp.chk('T7b Ouro manual + 68% personalizada: Ouro, 68%', eff->>'level' = 'Ouro' and (eff->>'commission_rate_bp')::int = 6800, eff::text);
  perform public.admin_clear_custom_commission('3f156f12-88dd-42e0-b12c-0aecc1291083', carlos, 'teste');

  -- T8 cria nível novo
  plat := public.admin_upsert_level('3f156f12-88dd-42e0-b12c-0aecc1291083', null,
            '{"name":"Platina","commission_prepaid_bp":7000,"commission_postpaid_bp":7000,"min_direct_referrals":25,"border_style":"glow","border_color":"#a78bfa"}'::jsonb);
  ov := public.admin_levels_overview();
  out := out || pg_temp.chk('T8 novo nível aparece na estrutura (6 níveis)', jsonb_array_length(ov->'levels') = 6 and exists (select 1 from jsonb_array_elements(ov->'levels') l where l->>'name' = 'Platina'), (ov->'levels')::text);

  -- T9 altera Ouro 60% -> 65%: comissões novas usam 65%, a antiga continua 60%
  update public.profiles set upline_id = carlos where id = payer;
  r := public.record_referral_commission(payer, 'prepaid', 10000, 'T9-A', null, null);
  perform public.admin_upsert_level('3f156f12-88dd-42e0-b12c-0aecc1291083', ouro, '{"commission_prepaid_bp":6500}'::jsonb);
  r := public.record_referral_commission(payer, 'prepaid', 10000, 'T9-B', null, null);
  select commission_rate_bp into rate_old from public.commissions where transaction_id = 'T9-A' and user_id = carlos;
  select commission_rate_bp into rate_new from public.commissions where transaction_id = 'T9-B' and user_id = carlos;
  out := out || pg_temp.chk('T9 comissão antiga fica em 60% e a nova usa 65%', rate_old = 6000 and rate_new = 6500, rate_old || ' / ' || rate_new);
  select amount into wal from public.wallet_transactions where source_payment_id = 'T9-B' and user_id = carlos;
  out := out || pg_temp.chk('T9b carteira recebe 65,00 (R$ 100 x 65%)', wal = 65.00, coalesce(wal::text, 'sem linha'));

  -- T10..T12 contas em centavos
  out := out || pg_temp.chk('T10 pré R$ 50 x 50% = R$ 25,00', public.commission_cents(5000, 5000) = 2500);
  out := out || pg_temp.chk('T11 pós R$ 100 x 50% = R$ 50,00', public.commission_cents(10000, 5000) = 5000);
  out := out || pg_temp.chk('T12 R$ 100 x 70% = R$ 70,00', public.commission_cents(10000, 7000) = 7000);
  out := out || pg_temp.chk('T12b R$ 50 (pós quitação) x 55% = R$ 27,50', public.commission_cents(5000, 5500) = 2750);
  out := out || pg_temp.chk('T12c R$ 100 x 40% = R$ 40,00', public.commission_cents(10000, 4000) = 4000);

  -- Idempotência
  r := public.record_referral_commission(payer, 'prepaid', 10000, 'T9-B', null, null);
  select count(*) into n from public.commissions where transaction_id = 'T9-B';
  out := out || pg_temp.chk('Reentrega do mesmo pagamento não duplica', n = 1 and r->>'reason' = 'já registrada', r::text);

  -- Travas
  begin
    perform public.admin_upsert_level(null, ouro, '{"commission_prepaid_bp":7100}'::jsonb);
    out := out || pg_temp.chk('Teto: nível acima de 70% é recusado', false, 'permitiu');
  exception when others then out := out || pg_temp.chk('Teto: nível acima de 70% é recusado', true); end;
  begin
    perform public.admin_set_custom_commission(null, tester2, 7100, null, 'x');
    out := out || pg_temp.chk('Teto: personalizada acima de 70% é recusada', false, 'permitiu');
  exception when others then out := out || pg_temp.chk('Teto: personalizada acima de 70% é recusada', true); end;
  begin
    perform public.admin_set_custom_commission(null, tester2, -1, null, 'x');
    out := out || pg_temp.chk('Percentual negativo é recusado', false, 'permitiu');
  exception when others then out := out || pg_temp.chk('Percentual negativo é recusado', true); end;
  begin
    perform public.admin_upsert_level(null, ouro, '{"min_direct_referrals":-3}'::jsonb);
    out := out || pg_temp.chk('Requisito negativo é recusado', false, 'permitiu');
  exception when others then out := out || pg_temp.chk('Requisito negativo é recusado', true); end;
  begin
    perform public.admin_upsert_level(null, ouro, '{"min_direct_referrals":3}'::jsonb);  -- Ouro exigiria menos que a Prata (10)
    out := out || pg_temp.chk('Escada incoerente (Ouro exige menos que Prata) é recusada', false, 'permitiu');
  exception when others then out := out || pg_temp.chk('Escada incoerente (Ouro exige menos que Prata) é recusada', true); end;
  begin
    perform public.admin_upsert_level(null, null, '{"name":"Dup","level_order":2,"commission_prepaid_bp":5000,"min_direct_referrals":5}'::jsonb);
    set constraints all immediate;
    out := out || pg_temp.chk('Duas ordens iguais são recusadas', false, 'permitiu');
  exception when others then out := out || pg_temp.chk('Duas ordens iguais são recusadas', true); end;
  begin
    perform public.admin_upsert_level(null, null, '{"name":"Futuro","commission_prepaid_bp":5000,"requirements":{"personal_sales":3}}'::jsonb);
    out := out || pg_temp.chk('Critério ainda não implementado é recusado', false, 'permitiu');
  exception when others then out := out || pg_temp.chk('Critério ainda não implementado é recusado', true); end;

  -- Reordenar (trocar duas posições sem estourar a unicidade)
  perform public.admin_reorder_levels(null, (select array_agg(id order by level_order) from public.network_levels));
  out := out || pg_temp.chk('Reordenar mantendo a ordem funciona', true);

  -- Comissão personalizada não muda o nome do nível
  eff := public.get_effective_commission(tester2, 'prepaid');
  out := out || pg_temp.chk('Nível do tester2 segue Bronze', eff->>'level' = 'Bronze', eff::text);

  return out;
end $f$;

select pg_temp.run() as resultado;
