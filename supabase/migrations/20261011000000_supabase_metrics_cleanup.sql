-- Limpa a lista de métricas do painel Financeiro > Supabase, deixando só
-- o que dá pra medir de verdade (automático, via SQL ou telemetria
-- própria). O resto (Log Ingestion/Query, Cached Egress, conexões
-- simultâneas de pico do Realtime, invocações de Edge Functions, MAU via
-- SSO/terceiros, transformações de imagem, sincronização de pipelines) é
-- medido dentro da infraestrutura do próprio Supabase — nunca passa pelo
-- nosso cliente, não tem como automatizar, e também não é usado pelo
-- iUser hoje. Editar isso à mão só gerava número desatualizado parado.
DELETE FROM public.supabase_usage_metrics
WHERE metric_name IN (
    'Conexões simultâneas de pico (Realtime)',
    'Consulta de Logs (Log Query)',
    'Egress em cache (Cached Egress)',
    'Ingestão de Logs (Log Ingestion)',
    'Invocações de Edge Functions',
    'Sincronização inicial de Pipelines',
    'Transformações de imagem (Storage)',
    'Usuários ativos de terceiros (Third-Party MAU)',
    'Usuários ativos via SSO (SSO MAU)'
);
