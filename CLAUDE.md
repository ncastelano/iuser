# iUser

Marketplace multi-serviço (lojas, perfis pessoais, motoristas, prestadores de serviço, recrutamento) em Next.js + Supabase.

## Arquitetura e versões da interface (2.0 / 3.0) — leia antes de criar arquivos

Detalhes e justificativas: `docs/ARCHITECTURE.md` e `docs/decisions/`. Resumo operacional:

- **Monólito modular, feature-based, camadas pragmáticas.** `app/` (rotas finas) → `versions/<v>` (apresentação e
  navegação de uma versão) → `modules/<dominio>` (regra de negócio, sem React quando possível) → `lib` (infra/utilitários).
  Código antigo plano (`components/`, `lib/`, `hooks/`) **fica onde está**; migra só quando for tocado e houver ganho.
- **Onde criar o quê:** página nova = arquivo fino em `src/app/...` que compõe uma tela; tela/layout/navbar/drawer de
  uma versão = `src/versions/<v>/...`; tela com a MESMA lógica nas duas versões = `src/versions/shared/screens/`
  (recebe `ui` e só troca a moldura); regra de negócio de um domínio = `src/modules/<dominio>/`; migration =
  `supabase/migrations/`; teste de regra pura = `scripts/test-*.mjs` + script `npm run test:*`.
- **Importações:** `modules` nunca importa `versions`/`app`; uma versão nunca importa outra versão; sem dependência
  circular; módulos só expõem `index.ts`. Antes de fechar uma mudança estrutural:
  `npx madge --circular --extensions ts,tsx --ts-config tsconfig.json src/versions` (a única conhecida é
  `lib/supabase/client.ts` ↔ `lib/usageTelemetry.ts`).
- **A versão da interface decide SÓ apresentação.** Nunca use a versão para liberar permissão, dado, plano ou saldo,
  nem espalhe `if (version === ...)` pelas páginas. A decisão é única: `src/proxy.ts` + `src/versions/{registry,resolve}.ts`.
  - Escolha: cookie `iuser_ui` + `profiles.preferred_version` (RPC `set_my_ui_version`). **Acesso**: a 3.0 é liberada
    pelo admin por perfil (`ui_v3_access`) ou para todos (`feature_flags.ui_v3`, desligada); o admin geral sempre
    tem (botão flutuante **v3** na home 2.0). Sem permissão, a 3.0 não aparece em lugar nenhum. Padrão: `v2`.
  - Na 3.0 **toda** página abre dentro da casca (`VersionFrame`); o `Header` da 2.0 vira compacto via `InsideShell`.
    Tela cheia (mapa) → posicione com `top-[var(--shell-top,0px)]` em vez de `inset-0`; fora da casca → `SHELL_EXCLUDED`. Ao migrar uma página, ajuste só o que ficar estranho na casca.
  - URLs compartilhadas (`/`, `/carrinho`, `/conversas`, `/lojas`) mantêm o endereço; a 3.0 é servida por *rewrite* para
    `/modeloinicial`, `/v3/carrinho`, `/v3/conversas`, `/v3/lojas`. **Nova URL que existirá nas duas versões** → entrada em
    `VERSION_ROUTES` (`registry.ts`) e teste em `scripts/test-versions.mjs`. Página só da 3.0 → fica em
    `app/(main)/(shell)/` e entra em `IGNORED_ROUTES`/`IGNORED_PREFIXES` + `V3_ONLY_*` em `registry.ts`.
  - Seletor de versão: UM mecanismo (`switchVersion` em `src/versions/client.tsx`), exibido só em dois lugares —
    `ProfileDashboard` (2.0, com permissão), botão **v3** do admin na home 2.0 e drawer (3.0). Não crie outro.
- **Não mexa sem justificativa:** a casca da 3.0 (`src/versions/v3/shell/ModeShell.tsx`: navbar, drawer, aba que
  desliza e encaixa no cartão), `src/proxy.ts`, a lógica de `CarrinhoScreen`/`ConversasScreen`, e a telemetria de
  `lib/supabase/client.ts`. Preserve o comportamento visual/interativo existente ao refatorar.
- **Testar:** `npx tsc --noEmit`, `npm run test:versions` (e `test:graduation`/`test:fare` se tocar nessas áreas),
  `npx next build` (pare o `next dev` antes: os dois usam `.next`), e conferir no navegador as duas versões
  (v2 e v3: troca nos dois sentidos, sessão preservada, preferência salva, URL antiga funcionando).

## Serviços externos pagos — manter a aba Financeiro atualizada

O admin (`/administrador` — aba "Administrador" do Header → **Financeiro**, componente `src/components/AdminDashboard/FinanceSection.tsx`, tabela `service_expenses`) rastreia todo serviço externo pago que o iUser depende pra continuar no ar (Supabase, Asaas, Mapbox, Firebase, hospedagem, domínio etc), pra saber quanto se gasta por mês e não deixar nenhuma conta vencer sem perceber.

**Sempre que integrar um novo serviço pago** (uma nova API/SaaS que tem custo — mesmo que comece no plano grátis), cadastre uma linha em `service_expenses` numa migration (mesmo padrão da seed em `supabase/migrations/20261005000000_service_expenses.sql`): nome do serviço, categoria, `monthly_cost` (0 se ainda não souber o valor real), `billing_cycle` (`monthly`/`yearly`/`usage`/`one_time`) e uma nota dizendo pra que serve e onde no código é usado. Isso vale pra qualquer serviço novo, não só os 4 que já existem hoje.

## Tarifa da plataforma: mora no banco, editada no Admin

Os valores da "Tarifa iUser" (valor base, distância base, valor por km e extras por tipo/condição, por veículo) vivem na tabela `platform_tariffs` e são editados em `/administrador` → **Tarifas** (`src/components/AdminDashboard/PlatformTariffsSection.tsx`). Os números em `src/lib/driverPricing.ts` (`PLATFORM_DEFAULT_PRICING_BY_VEHICLE`) são só o padrão de fábrica: `loadPlatformTariffs()` (`src/lib/platformTariffs.ts`) sobrescreve esse mesmo objeto com o que está no banco. **Antes de calcular qualquer preço da plataforma, dê `await loadPlatformTariffs(client)`** — não coloque valores de tarifa fixos em outro lugar.

## Roteamento: não tem middleware.ts, tem src/proxy.ts

Esse projeto **não usa** o `middleware.ts` padrão do Next.js — o roteamento de `/{slug}` (decidir se é perfil, loja, categoria ou 404) é feito à mão em `src/proxy.ts`, com uma lista explícita `IGNORED_ROUTES` de rotas que **não** são slug de perfil/loja.

**Sempre que criar uma página nova de 1 segmento na raiz** (`/algo`, ex: `/meus-servicos`, `/planos`), adicione o caminho em `IGNORED_ROUTES` em `src/proxy.ts`. Sem isso, o proxy tenta casar `/algo` com `profiles.profileSlug` / `stores.storeSlug`, não acha, e redireciona pra "Perfil ou loja não encontrado" — a página existe mas nunca é alcançada em produção (em dev o proxy deixa passar de qualquer jeito, então o bug só aparece depois do deploy). Rotas aninhadas com segmento **dinâmico** (`/algo/[param]`, ex: `/acompanhar-corrida/[id]`) normalmente não precisam disso — o primeiro segmento (`algo`) já está em `IGNORED_ROUTES` ou é validado como perfil/loja, e o proxy só olha o primeiro segmento pra decidir. **Mas rotas aninhadas com segmento fixo** (`/algo/outro`, ex: `/pedir-motorista/escolher-local`, `/aceitar-corridas/mapa`) **precisam sim** de uma entrada própria e exata em `IGNORED_ROUTES` — o proxy não propaga "ignorado" do pai pro filho, e como o primeiro segmento (`algo`) não é slug de perfil/loja nem bate em nenhum caso especial, cai direto no 404 em produção. Se o segmento dinâmico for o próprio pai (ex: `/acompanhar-corrida/<id>`, sem página em `/acompanhar-corrida` sozinho), a entrada precisa ser um prefixo em `IGNORED_PREFIXES` (`/acompanhar-corrida/`), não uma rota exata.

## Entrega iUser dos pedidos da loja: frete, raio e reajuste moram no banco

Loja com "Entregador do iUser" não define valor: o banco mantém as colunas `delivery_*` da loja iguais à Tarifa iUser de moto + extra de objeto (`apply_iuser_delivery_tariff`, migration `20261081000000`). Quando a loja aceita o pedido (`pending → preparing`), o gatilho abre a oferta (`order_delivery_dispatches`/`order_delivery_rounds`, migration `20261082000000`): corrida de objeto com o frete que o cliente pagou e raio inicial. A cada intervalo sem motorista, `process_order_delivery_dispatches()` (pg_cron, todo minuto) amplia o raio e **propõe** um aumento ao cliente; só vale com `respond_delivery_increase` (cliente), que grava frete original, acréscimo, frete final, valor do motorista, data e autor, e ajusta `orders.delivery_fee/total_amount`. O acréscimo nunca sai da loja nem do iUser. Regras ajustáveis em Admin → **Entregas** (`delivery_dispatch_settings`). **Nunca** aceite valor de frete vindo do app; o motorista só aceita `ride_requests.offered_price`. O motorista também pode **contrapropor a Minha tarifa** (`/api/rides/delivery-counter` calcula o valor no servidor → `create_delivery_counter`); só vale se o cliente autorizar (`respond_delivery_counter`), e aí ele fica com a entrega. Os avisos de push (aumento proposto, raio ampliado, valor aumentado, entregue) saem de uma fila no banco (`order_delivery_events`) que `pg_net` aciona em `/api/internal/delivery-events` (URL em `delivery_dispatch_settings.notify_url`; a rota só processa a fila, nada do corpo). Corrida finalizada → `orders.status='paid'` e `stage='delivered'`. O motorista escolhe um raio próprio (`driver_pricing.delivery_radius_km`); vale o MENOR. O raio filtra a lista do motorista, o push (`notifyDriversOfRide`) e a candidatura (`enforce_delivery_radius`).

## Pedidos e corridas: segurança e integridade (Etapa 1.5) — leia antes de mexer em `orders`, `ride_requests` ou `ride_applications`

- **Ninguém insere em `orders`/`order_items` direto.** Pedido do carrinho = RPC `create_store_order` (via `src/lib/createStoreOrder.ts`); venda presencial = `create_in_person_sale`. Preço de produto/adicional, frete (`_compute_store_delivery_fee`), desconto do Club VIP, total e status inicial (`pending`) saem do **banco**; o app só manda o que o cliente escolheu. Não mande nem confie em `total_amount`/`delivery_fee`/`status` vindos do app.
- **`orders` UPDATE:** a loja só muda `status`, por transições válidas (`guard_orders_update`); valores e vínculos são imutáveis. **DELETE:** só o comprador, pedido `pending` e sem corrida/entrega (`guard_orders_delete`).
- **`ride_requests` não é público.** Corrida pendente é lida pelos motoristas em **`ride_offers`** (projeção sem dados pessoais: bairro aproximado, coordenadas arredondadas, sem nomes/telefones/complementos; mantida por gatilho). Dados completos só para o solicitante e o motorista que aceitou. Visitante sem login não lê nada.
- **`ride_requests` UPDATE/INSERT:** gatilhos de guarda (`guard_ride_requests_*`) deixam o cliente mexer só nas colunas do seu papel; `offered_price`, `store_id`, `order_id`, `driver_id`, endereços e status são do servidor. Aceitar motorista = `select_ride_driver`; concluir = `complete_ride` (motorista da corrida, corrida iniciada, ≤ 100 m do destino); cancelar é direto, com `cancelled_by` coerente. Funções `SECURITY DEFINER`/service role são confiáveis (`current_user` fora de `authenticated`/`anon`).
- Entrega de loja tem frete **fixo**: candidatura só pelo `offered_price` e sem "tarefa extra".
- **Link público de acompanhamento** (`/acompanhar-corrida/<token>` → `/api/ride-share/<token>`): o segredo é `ride_requests.share_token` (160 bits, só solicitante e motorista da corrida enxergam; nunca o id da corrida, que circula entre motoristas). Expira 6 h depois de concluída/cancelada (máx. 30 dias), 404 único, limite por IP, `noindex`. Trocar o link: `rotate_ride_share_token`. Entrega de loja mostra só a região do cliente.
- Candidatura perdedora: ao fechar a corrida (aceita/concluída/cancelada) o banco rejeita as pendentes (`reject_losing_ride_applications`). O motorista não relacionado vê só `ride_offers` (sem nome do passageiro: "Passageiro").
- Rollback: `supabase/rollbacks/etapa_1_5_rollback.sql` (restaura policies/grants/funções/triggers anteriores).

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

"Melhores perfis" (`/social`) = `get_best_profiles`: **só pontos (do maior pro menor)**, empate por visitas e avaliação. A hierarquia (`user_statuses`) **não** entra no ranking e os pontos **não** promovem ninguém de nível: a hierarquia continua sendo concedida só pelo admin.

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
