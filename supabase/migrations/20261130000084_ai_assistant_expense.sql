-- 20261130000084_ai_assistant_expense.sql
-- Financeiro (Admin): a IA do iUser (o "O que você procura?" da home entende pedidos e propõe a ação; src/app/api/ai/assistant)
-- usa a Claude API da Anthropic, cobrada por USO (tokens). Custo 0 até o admin preencher o valor real. Reaplicável.
-- O uso diário aparece em service_usage_telemetry_daily (service 'anthropic': messages e tokens).
-- Rollback: supabase/rollbacks/ai_assistant_expense_rollback.sql
INSERT INTO public.service_expenses (service_name, category, monthly_cost, billing_cycle, notes)
SELECT 'Anthropic (Claude API)', 'IA', 0, 'usage',
       'IA do iUser no "O que você procura?" da home: entende o pedido (texto ou voz) e propõe a ação, que a pessoa confirma. Variável ANTHROPIC_API_KEY. Código: src/app/api/ai/assistant/route.ts, src/modules/ai-assistant. Limite de 10 pedidos por minuto e 60 por dia por pessoa.'
WHERE NOT EXISTS (SELECT 1 FROM public.service_expenses WHERE service_name = 'Anthropic (Claude API)');
