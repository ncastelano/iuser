# iUser

Marketplace multi-serviço (lojas, perfis pessoais, motoristas, prestadores de serviço, recrutamento) em Next.js + Supabase.

## Serviços externos pagos — manter a aba Financeiro atualizada

O admin (`/` → aba Admin → **Financeiro**, componente `src/components/AdminDashboard/FinanceSection.tsx`, tabela `service_expenses`) rastreia todo serviço externo pago que o iUser depende pra continuar no ar (Supabase, Asaas, Mapbox, Firebase, hospedagem, domínio etc), pra saber quanto se gasta por mês e não deixar nenhuma conta vencer sem perceber.

**Sempre que integrar um novo serviço pago** (uma nova API/SaaS que tem custo — mesmo que comece no plano grátis), cadastre uma linha em `service_expenses` numa migration (mesmo padrão da seed em `supabase/migrations/20261005000000_service_expenses.sql`): nome do serviço, categoria, `monthly_cost` (0 se ainda não souber o valor real), `billing_cycle` (`monthly`/`yearly`/`usage`/`one_time`) e uma nota dizendo pra que serve e onde no código é usado. Isso vale pra qualquer serviço novo, não só os 4 que já existem hoje.

## Roteamento: não tem middleware.ts, tem src/proxy.ts

Esse projeto **não usa** o `middleware.ts` padrão do Next.js — o roteamento de `/{slug}` (decidir se é perfil, loja, categoria ou 404) é feito à mão em `src/proxy.ts`, com uma lista explícita `IGNORED_ROUTES` de rotas que **não** são slug de perfil/loja.

**Sempre que criar uma página nova de 1 segmento na raiz** (`/algo`, ex: `/meus-servicos`, `/planos`), adicione o caminho em `IGNORED_ROUTES` em `src/proxy.ts`. Sem isso, o proxy tenta casar `/algo` com `profiles.profileSlug` / `stores.storeSlug`, não acha, e redireciona pra "Perfil ou loja não encontrado" — a página existe mas nunca é alcançada em produção (em dev o proxy deixa passar de qualquer jeito, então o bug só aparece depois do deploy). Rotas aninhadas com segmento **dinâmico** (`/algo/[param]`, ex: `/acompanhar-corrida/[id]`) normalmente não precisam disso — o primeiro segmento (`algo`) já está em `IGNORED_ROUTES` ou é validado como perfil/loja, e o proxy só olha o primeiro segmento pra decidir. **Mas rotas aninhadas com segmento fixo** (`/algo/outro`, ex: `/pedir-motorista/escolher-local`, `/aceitar-corridas/mapa`) **precisam sim** de uma entrada própria e exata em `IGNORED_ROUTES` — o proxy não propaga "ignorado" do pai pro filho, e como o primeiro segmento (`algo`) não é slug de perfil/loja nem bate em nenhum caso especial, cai direto no 404 em produção. Se o segmento dinâmico for o próprio pai (ex: `/acompanhar-corrida/<id>`, sem página em `/acompanhar-corrida` sozinho), a entrada precisa ser um prefixo em `IGNORED_PREFIXES` (`/acompanhar-corrida/`), não uma rota exata.

## Telemetria própria de Egress/Realtime — não mexer sem saber

O Supabase não expõe Egress nem Realtime Messages por nenhuma API pública documentada (confirmado testando ao vivo os endpoints da Management API — ver commit `b1b81d8`). Por isso o iUser mede isso sozinho:

- `src/lib/usageTelemetry.ts` acumula bytes/mensagens em memória no navegador e manda pro banco a cada 20s via RPC `track_usage` (SECURITY DEFINER, grava em `usage_telemetry_daily`).
- `src/lib/supabase/client.ts` é o único ponto de instrumentação: um `fetch` customizado mede o tamanho de toda resposta (Egress), e `.channel()` é envolvido uma vez só pra contar toda mensagem de Realtime recebida (`.on(...)` callback). Isso cobre o app inteiro automaticamente — **não precisa (e não deve) instrumentar chamada por chamada** nos ~17 arquivos que usam `.channel()` nem nos componentes que usam `supabase.from(...)`.
- Painel: `src/components/AdminDashboard/SupabaseUsagePanel.tsx`, sincronizado a cada carregamento via `/api/admin/expenses/supabase-stats`. É aproximado (não bate com o número exato do Supabase, que conta overhead de protocolo) — serve pra ver a tendência de crescimento, não pra bater com a fatura.

Se `src/lib/supabase/client.ts` for reescrito no futuro (ex: trocar `createBrowserClient` por outra forma de inicializar o client), **preserva o `global: { fetch: trackedFetch }` e o wrap de `.channel()`**, ou a telemetria para de funcionar silenciosamente (sem erro, só para de contar).

## Supabase CLI e o token do MCP

O MCP do Supabase (`.mcp.json`) usa um token só de leitura (`SUPABASE_ACCESS_TOKEN`, configurado em `.claude/settings.local.json`, não versionado). Esse mesmo env var também é lido pelo `npx supabase` (CLI) e, sendo só leitura, **quebra `supabase db push`** com erro 403 (`Missing required permission(s): database_write`).

Sempre rode migrations com o token do MCP desligado só pra esse comando:
```bash
env -u SUPABASE_ACCESS_TOKEN npx supabase db push
```
