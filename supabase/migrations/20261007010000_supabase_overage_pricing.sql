-- Estimativa de custo extra do Supabase: preço por unidade acima do que
-- está incluído no plano, pra calcular quanto cada métrica pode custar se
-- passar da cota — Supabase cobra em dólar, por isso o preço aqui é em
-- US$, diferente do resto da aba Financeiro (que é em R$). Os valores
-- abaixo são os preços públicos de overage do plano Pro (supabase.com/
-- pricing) na época dessa migration — o admin deve conferir/ajustar se o
-- plano ou os preços da Supabase mudarem.
ALTER TABLE public.supabase_usage_metrics ADD COLUMN IF NOT EXISTS overage_price_per_unit NUMERIC NOT NULL DEFAULT 0;

UPDATE public.supabase_usage_metrics SET overage_price_per_unit = 0.125 WHERE metric_name = 'Banco de dados' AND overage_price_per_unit = 0;
UPDATE public.supabase_usage_metrics SET overage_price_per_unit = 0.021 WHERE metric_name = 'Armazenamento (Storage)' AND overage_price_per_unit = 0;
UPDATE public.supabase_usage_metrics SET overage_price_per_unit = 0.09 WHERE metric_name = 'Largura de banda (Egress)' AND overage_price_per_unit = 0;
UPDATE public.supabase_usage_metrics SET overage_price_per_unit = 0.00325 WHERE metric_name = 'Usuários ativos por mês (MAU)' AND overage_price_per_unit = 0;
UPDATE public.supabase_usage_metrics SET overage_price_per_unit = 0.000002 WHERE metric_name = 'Invocações de Edge Functions' AND overage_price_per_unit = 0;
UPDATE public.supabase_usage_metrics SET overage_price_per_unit = 0.0000025 WHERE metric_name = 'Mensagens Realtime' AND overage_price_per_unit = 0;
