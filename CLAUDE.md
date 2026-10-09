# iUser

Marketplace multi-serviço (lojas, perfis pessoais, motoristas, prestadores de serviço, recrutamento) em Next.js + Supabase.

## Serviços externos pagos — manter a aba Financeiro atualizada

O admin (`/administrador` — aba "Administrador" do Header → **Financeiro**, componente `src/components/AdminDashboard/FinanceSection.tsx`, tabela `service_expenses`) rastreia todo serviço externo pago que o iUser depende pra continuar no ar (Supabase, Asaas, Mapbox, Firebase, hospedagem, domínio etc), pra saber quanto se gasta por mês e não deixar nenhuma conta vencer sem perceber.

**Sempre que integrar um novo serviço pago** (uma nova API/SaaS que tem custo — mesmo que comece no plano grátis), cadastre uma linha em `service_expenses` numa migration (mesmo padrão da seed em `supabase/migrations/20261005000000_service_expenses.sql`): nome do serviço, categoria, `monthly_cost` (0 se ainda não souber o valor real), `billing_cycle` (`monthly`/`yearly`/`usage`/`one_time`) e uma nota dizendo pra que serve e onde no código é usado. Isso vale pra qualquer serviço novo, não só os 4 que já existem hoje.

## Tarifa da plataforma: mora no banco, editada no Admin

Os valores da "Tarifa iUser" (valor base, distância base, valor por km e extras por tipo/condição, por veículo) vivem na tabela `platform_tariffs` e são editados em `/administrador` → **Tarifas** (`src/components/AdminDashboard/PlatformTariffsSection.tsx`). Os números em `src/lib/driverPricing.ts` (`PLATFORM_DEFAULT_PRICING_BY_VEHICLE`) são só o padrão de fábrica: `loadPlatformTariffs()` (`src/lib/platformTariffs.ts`) sobrescreve esse mesmo objeto com o que está no banco. **Antes de calcular qualquer preço da plataforma, dê `await loadPlatformTariffs(client)`** — não coloque valores de tarifa fixos em outro lugar.

## Roteamento: não tem middleware.ts, tem src/proxy.ts

Esse projeto **não usa** o `middleware.ts` padrão do Next.js — o roteamento de `/{slug}` (decidir se é perfil, loja, categoria ou 404) é feito à mão em `src/proxy.ts`, com uma lista explícita `IGNORED_ROUTES` de rotas que **não** são slug de perfil/loja.

**Sempre que criar uma página nova de 1 segmento na raiz** (`/algo`, ex: `/meus-servicos`, `/planos`), adicione o caminho em `IGNORED_ROUTES` em `src/proxy.ts`. Sem isso, o proxy tenta casar `/algo` com `profiles.profileSlug` / `stores.storeSlug`, não acha, e redireciona pra "Perfil ou loja não encontrado" — a página existe mas nunca é alcançada em produção (em dev o proxy deixa passar de qualquer jeito, então o bug só aparece depois do deploy). Rotas aninhadas com segmento **dinâmico** (`/algo/[param]`, ex: `/acompanhar-corrida/[id]`) normalmente não precisam disso — o primeiro segmento (`algo`) já está em `IGNORED_ROUTES` ou é validado como perfil/loja, e o proxy só olha o primeiro segmento pra decidir. **Mas rotas aninhadas com segmento fixo** (`/algo/outro`, ex: `/pedir-motorista/escolher-local`, `/aceitar-corridas/mapa`) **precisam sim** de uma entrada própria e exata em `IGNORED_ROUTES` — o proxy não propaga "ignorado" do pai pro filho, e como o primeiro segmento (`algo`) não é slug de perfil/loja nem bate em nenhum caso especial, cai direto no 404 em produção. Se o segmento dinâmico for o próprio pai (ex: `/acompanhar-corrida/<id>`, sem página em `/acompanhar-corrida` sozinho), a entrada precisa ser um prefixo em `IGNORED_PREFIXES` (`/acompanhar-corrida/`), não uma rota exata.

## Graduação e comissão de indicação: mora no banco, nunca fixe um percentual no código

A comissão que quem indica ganha vem da **graduação** (Inicial/Bronze/Prata/Ouro/Diamante... — níveis que o admin cria e edita em `/administrador` → **Graduação**, tabela `network_levels`). Não confundir com a "Hierarquia" (`user_statuses`: Usuário/Líder/Supervisor/Gestor/Administrador), que é autoridade administrativa.

- **Fonte única da verdade = funções do banco** (`supabase/migrations/20261029000000_graduation_levels_and_commissions.sql`): `get_effective_commission(user, 'prepaid'|'postpaid')`, `check_and_upgrade_user_level`, `record_referral_commission` (livro-caixa `commissions` + carteira na mesma transação, idempotente por pagamento, taxa congelada na linha). **Nunca** calcule ou fixe um percentual de comissão em TS/React; o webhook da Asaas (`creditReferralCommission`) só chama a RPC.
- Prioridade: comissão personalizada ativa > nível efetivo (o MAIOR entre o conquistado e o concedido pelo admin) > nível inicial. O nível **nunca desce**; comissão personalizada **não** muda o nome do nível. Teto padrão 70% (`network_settings`).
- Dinheiro em **centavos** e percentual em **pontos-base** (50% = 5000): sem ponto flutuante (`src/lib/graduation.ts`, `commission_cents` no banco).
- Base de cálculo: Pré-pago = a mensalidade realmente paga (R$ 100); Pós-pago = a quitação por Pix (hoje R$ 50) — sempre o valor **realmente pago**, nunca o preço da tabela.
- O estado de cada pessoa fica em `user_network_state` (cliente só lê a própria linha), não em `profiles` (legível por todos). Escritas só por funções `admin_*` via `/api/admin/graduation` (`requireSuperAdmin`).
- Bordas de avatar por nível: `avatar_borders.required_level_id` (migration `20261031000000`) — `claim_avatar_border` só libera se o nível EFETIVO da pessoa for ≥ ao exigido; há uma borda por nível (Bronze→Diamante), editáveis em Admin → Bordas. A regra mora no banco, o diálogo Bordas só mostra o motivo.
- Testes: `npm run test:graduation` (conta em centavos) e `supabase/tests/graduation_scenarios.sql` (33 cenários, rode dentro de `begin; ... rollback;`).

## Pontuação dos perfis: pesos no banco, ações por gatilho

Cada ação que pontua tem uma linha em `point_rules` (pontos, limite por dia, ligada/desligada) editada em `/administrador` → **Pontuação**. Os pontos vão pro livro-caixa `profile_points_events` (o peso fica **congelado** na linha; 1 vez por `ref`) e somam em `profile_points`. Quem dá os pontos são **gatilhos do banco** (`supabase/migrations/20261037000000_profile_points.sql`: convite via `profiles.upline_id`, `follows`, `products` — publicação e serviço) chamando `_award_points`; **não conte pontos em TS/React**. Pra pontuar uma ação nova: crie a regra em `point_rules` e um gatilho que chame `_award_points(perfil, 'acao', ref)`.

"Melhores perfis" (`/social`) = `get_best_profiles`: **pontos (do maior pro menor)** → nível de hierarquia (`user_statuses.level`, só desempata) → visitas. Os pontos **não** promovem ninguém de nível automaticamente (a hierarquia continua sendo concedida pelo admin).

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
