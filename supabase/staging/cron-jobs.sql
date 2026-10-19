-- Jobs agendados (pg_cron) do STAGING: mesmos 4 da produção (nomes e horários iguais). Idempotente: cron.schedule
-- com o mesmo nome apenas atualiza. Rodar só no staging:  python3 scripts/staging/apply-sql.py supabase/staging/cron-jobs.sql
SELECT cron.schedule('community-photo-close-rounds', '*/10 * * * *', 'SELECT public.close_all_community_rounds()');
SELECT cron.schedule('order-delivery-dispatch-tick', '* * * * *', 'SELECT public.process_order_delivery_dispatches()');
SELECT cron.schedule('delivery-estimates-cleanup', '17 3 * * *', $$DELETE FROM public.delivery_estimates WHERE order_id IS NULL AND created_at < now() - interval '7 days'$$);
SELECT cron.schedule('order-delivery-v2-tick', '* * * * *', 'SELECT public.process_delivery_search_v2()');
