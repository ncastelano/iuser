# iUser

Marketplace multi-serviço (lojas, perfis pessoais, motoristas, prestadores de serviço, recrutamento) em Next.js + Supabase.

## Serviços externos pagos — manter a aba Financeiro atualizada

O admin (`/` → aba Admin → **Financeiro**, componente `src/components/AdminDashboard/FinanceSection.tsx`, tabela `service_expenses`) rastreia todo serviço externo pago que o iUser depende pra continuar no ar (Supabase, Asaas, Mapbox, Firebase, hospedagem, domínio etc), pra saber quanto se gasta por mês e não deixar nenhuma conta vencer sem perceber.

**Sempre que integrar um novo serviço pago** (uma nova API/SaaS que tem custo — mesmo que comece no plano grátis), cadastre uma linha em `service_expenses` numa migration (mesmo padrão da seed em `supabase/migrations/20261005000000_service_expenses.sql`): nome do serviço, categoria, `monthly_cost` (0 se ainda não souber o valor real), `billing_cycle` (`monthly`/`yearly`/`usage`/`one_time`) e uma nota dizendo pra que serve e onde no código é usado. Isso vale pra qualquer serviço novo, não só os 4 que já existem hoje.

## Roteamento: não tem middleware.ts, tem src/proxy.ts

Esse projeto **não usa** o `middleware.ts` padrão do Next.js — o roteamento de `/{slug}` (decidir se é perfil, loja, categoria ou 404) é feito à mão em `src/proxy.ts`, com uma lista explícita `IGNORED_ROUTES` de rotas que **não** são slug de perfil/loja.

**Sempre que criar uma página nova de 1 segmento na raiz** (`/algo`, ex: `/meus-servicos`, `/planos`), adicione o caminho em `IGNORED_ROUTES` em `src/proxy.ts`. Sem isso, o proxy tenta casar `/algo` com `profiles.profileSlug` / `stores.storeSlug`, não acha, e redireciona pra "Perfil ou loja não encontrado" — a página existe mas nunca é alcançada em produção (em dev o proxy deixa passar de qualquer jeito, então o bug só aparece depois do deploy). Rotas aninhadas (`/algo/[param]`) normalmente não precisam disso — só a raiz de 1 segmento é verificada contra perfil/loja.

## Supabase CLI e o token do MCP

O MCP do Supabase (`.mcp.json`) usa um token só de leitura (`SUPABASE_ACCESS_TOKEN`, configurado em `.claude/settings.local.json`, não versionado). Esse mesmo env var também é lido pelo `npx supabase` (CLI) e, sendo só leitura, **quebra `supabase db push`** com erro 403 (`Missing required permission(s): database_write`).

Sempre rode migrations com o token do MCP desligado só pra esse comando:
```bash
env -u SUPABASE_ACCESS_TOKEN npx supabase db push
```
