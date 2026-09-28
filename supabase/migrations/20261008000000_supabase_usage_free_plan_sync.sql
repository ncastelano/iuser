-- Corrige o painel de uso do Supabase (aba Financeiro) com dados reais:
-- o projeto está no plano FREE (não Pro, como a migration anterior
-- assumiu por engano) — no Free, passar da cota não gera cobrança de
-- excedente, só restringe/deixa o projeto lento até o próximo ciclo. Por
-- isso zera overage_price_per_unit (não tem preço de excedente no Free)
-- e adiciona as métricas que a página de Usage do Supabase mostra de
-- verdade, com os valores reais do ciclo atual (13/set/2026–13/out/2026).

-- Sem cobrança de excedente no Free — zera até migrar pra um plano pago.
UPDATE public.supabase_usage_metrics SET overage_price_per_unit = 0;

-- Valores reais de uso, direto da página de Usage do Supabase.
UPDATE public.supabase_usage_metrics SET used_value = 0.046 WHERE metric_name = 'Banco de dados';
UPDATE public.supabase_usage_metrics SET used_value = 0.061 WHERE metric_name = 'Armazenamento (Storage)';
UPDATE public.supabase_usage_metrics SET used_value = 1.073 WHERE metric_name = 'Largura de banda (Egress)';
UPDATE public.supabase_usage_metrics SET used_value = 70 WHERE metric_name = 'Usuários ativos por mês (MAU)';
UPDATE public.supabase_usage_metrics SET used_value = 0 WHERE metric_name = 'Invocações de Edge Functions';
UPDATE public.supabase_usage_metrics SET used_value = 1704 WHERE metric_name = 'Mensagens Realtime';

-- Métricas novas que a página de Usage mostra e ainda não rastreávamos.
-- Cota (included_value) marcada como 0 + nota "confirmar" onde eu não
-- tenho certeza do valor exato do plano Free hoje — não quero inventar
-- número, é melhor o admin conferir na hora de preencher.
INSERT INTO public.supabase_usage_metrics (metric_name, used_value, included_value, unit, notes)
VALUES
    ('Egress em cache (Cached Egress)', 5.211, 0, 'GB', 'Cobrado separado do Egress normal — confirme a cota do Free em supabase.com/pricing'),
    ('Ingestão de Logs (Log Ingestion)', 1.895, 0, 'GB', 'Ainda "Upcoming" — cobrança só começa depois da carência (início de 2027)'),
    ('Consulta de Logs (Log Query)', 5.489, 0, 'GB', 'Ainda "Upcoming" — a cota de consulta escala com o quanto de log você ingere, sem cobrança direta ainda'),
    ('Conexões simultâneas de pico (Realtime)', 5, 200, 'conexões', 'Confirme a cota exata do Free em supabase.com/pricing'),
    ('Usuários ativos de terceiros (Third-Party MAU)', 0, 0, 'usuários', 'Confirme a cota do Free — métrica nova, ligada a integrações de auth de terceiros'),
    ('Usuários ativos via SSO (SSO MAU)', 0, 0, 'usuários', 'Não incluído no Free — precisa de plano superior pra usar SSO/SAML'),
    ('Transformações de imagem (Storage)', 0, 0, 'imagens', 'Não incluído no Free — precisa de plano superior'),
    ('Sincronização inicial de Pipelines', 0, 0, 'GB', 'Recurso de pipelines — sem uso registrado ainda')
ON CONFLICT (metric_name) DO NOTHING;

-- Marca o plano certo (Free) e o fim do ciclo atual na linha "Supabase"
-- da lista de gastos — o aviso de "vencendo em breve" do Financeiro passa
-- a valer também pro fim do ciclo de uso, não só pra cobrança em si.
UPDATE public.service_expenses
SET plan_name = 'Free', next_due_date = '2026-10-13', notes = 'Plano Free — sem cobrança de excedente, só restrição de uso ao passar da cota. Ciclo atual: 13/set/2026–13/out/2026.'
WHERE service_name = 'Supabase';

