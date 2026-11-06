# Arquitetura do iUser

> Documento de referência. Regras curtas para o dia a dia ficam no `CLAUDE.md`; decisões e alternativas em `docs/decisions/`.

## 1. Visão geral

O iUser é um **monólito modular** em Next.js (App Router) + Supabase. Uma única aplicação, um único deploy, com
fronteiras internas claras. Adotamos de forma **pragmática** (só onde trazem benefício real):

| Conceito | Como usamos |
|---|---|
| Modular Monolith | Um app só; o negócio é separado por domínio (`src/modules/<dominio>`) e a interface por versão (`src/versions/<v>`). |
| Feature-based | Código novo é agrupado pela funcionalidade, não pelo tipo de arquivo. |
| Clean Architecture (pragmática) | Regra de negócio **pura** (sem React, sem rede) separada da apresentação e da infraestrutura. Sem camadas "de enfeite". |
| DDD | Só para domínios com regra própria densa (graduação, tarifas, comissão, pontuação). Sem agregados/repositórios por obrigação. |
| App Router | Define rotas, layouts e composição. **Páginas são finas**: compõem telas, não contêm regra. |

> O repositório nasceu "plano" (`src/components`, `src/lib`, `src/hooks`). **Não migramos em massa.** O que existe
> continua onde está; a regra nova vale para código novo e para o que formos tocando (estratégia *strangler*).

## 2. Árvore de diretórios

```
src/
  app/                       # Rotas Next: páginas FINAS, layouts, route handlers (api/)
    (main)/                  # Interface 2.0 (páginas atuais, preservadas)
      (shell)/               # Rotas servidas dentro da casca da 3.0 (layout persistente)
        v3/ painel-perfil/ modoprestador/ painel-loja/ veiculo/
        v3/carrinho/ v3/conversas/   # implementações 3.0 de URLs compartilhadas (ver §5)
      carrinho/ conversas/ page.tsx  # implementações 2.0 dessas URLs
  versions/                  # Experiência de interface POR VERSÃO + o sistema de versionamento
    registry.ts              # versões, cookie, flag, mapa de rotas compartilhadas
    resolve.ts               # regras PURAS de resolução (testadas)
    client.tsx               # troca de versão, hooks, sincronização perfil↔cookie
    v3/shell/                # casca da 3.0: ModeShell (navbar + drawer), ShellFrame, PageTabs
    shared/screens/          # telas com a MESMA lógica nas duas versões; só a moldura muda
    access.ts                # (servidor) quem pode usar a 3.0
    VersionFrame.tsx         # moldura por versão (3.0 → casca)
  modules/                   # Domínios de negócio (nasce quando um domínio é tocado; ver §4)
  components/ lib/ hooks/ store/   # Código compartilhado existente (permanece)
docs/
  ARCHITECTURE.md  decisions/
supabase/migrations/         # Única forma de alterar o esquema
scripts/                     # Testes `node --test` das regras puras
```

## 3. Responsabilidade de cada camada

- **`app/`** — roteamento e composição. Uma página importa uma tela (de `versions/` ou `components/`) e a renderiza.
  Nada de regra de negócio nem de decisão de versão aqui.
- **`versions/<v>/`** — tudo que é *aparência e navegação* de uma versão: layout, navbar, drawer, páginas próprias.
  Uma versão **nunca importa de outra versão**.
- **`versions/shared/screens/`** — telas cuja lógica é a mesma nas versões (carrinho, conversas). Recebem `ui` e só
  trocam a moldura (Header antigo × casca da 3.0). Evita duplicar milhares de linhas de pedido/pagamento.
- **`modules/<dominio>/`** — regra de negócio e casos de uso, independentes de versão e de React quando possível.
  Estrutura interna *só quando a complexidade pedir*: `domain/` (regras puras), `application/` (casos de uso),
  `infrastructure/` (Supabase, APIs), `ui/` (componentes do domínio).
- **`lib/`, `components/`, `hooks/`, `store/`** — código compartilhado já existente (legado "plano"). Pode ser usado
  por qualquer camada. Ao mexer em algo de domínio rico, prefira extrair para `modules/`.
- **Banco (Supabase)** — a **fonte da verdade** das regras críticas (comissão, graduação, pontos, tarifa) e das
  permissões (RLS). A interface nunca decide permissão.

### Módulos existentes

- **`modules/chat`** — salas 1 a 1 e grupos: `api.ts` (chama as funções do banco: `start_conversation`,
  `create_group_conversation`, `invite_to_group`, `respond_group_invite`, `leave_group`...) e `ui/` (seletor de
  pessoas, nova conversa, dados do grupo). Regras (convite com aceitar/recusar, limite de 30, admin) vivem no banco.

## 4. Regras de dependência

```
app  →  versions  →  modules  →  lib (infra/utilitários)
 └────────────────→  components / hooks / store / lib (compartilhados)
```

1. `modules/*` **nunca** importa `versions/*` nem `app/*`.
2. `versions/<a>` **nunca** importa `versions/<b>`. O que as duas precisam fica em `versions/shared`, `modules` ou
   `components`.
3. `app/*` só importa para compor; ninguém importa de `app/` (exceção histórica: páginas v2 em `app/(main)/inicio`
   usadas pela home 3.0 — mover para `components`/`modules` quando forem tocadas).
4. Cada módulo expõe uma API pública (`index.ts`); não importe arquivos internos de outro módulo.
5. **Sem dependência circular.** Verificar: `npx madge --circular --extensions ts,tsx --ts-config tsconfig.json src/versions`
   (há uma antiga e conhecida: `lib/supabase/client.ts` ↔ `lib/usageTelemetry.ts`).

## 5. Versões da interface (2.0 / 3.0)

**A versão decide só a apresentação.** Identidade, papéis, permissões, plano, dados e regras são independentes dela.
Seleção de versão **não** concede nada: segurança continua no servidor e no RLS.

### Mecanismo

1. **Acesso (escondida até o admin liberar).** A 3.0 só existe para quem tem permissão: o **administrador geral**, os
   **perfis liberados** em `ui_v3_access` (Admin → Interface 3.0) ou todos, se a chave `feature_flags.ui_v3` estiver
   ligada ("liberar para todos", desligada por padrão). A regra mora no servidor (`versions/access.ts`) e vale no
   proxy, no layout e em `GET /api/ui-version/access`. Sem permissão, nada na interface menciona a 3.0 e qualquer
   cookie `v3` é ignorado (e limpo pelo cliente).
2. **Escolha**: cookie `iuser_ui` (`v2`|`v3`) + `profiles.preferred_version` (RPC `set_my_ui_version`, que só altera
   essa coluna da própria pessoa).
3. **Resolução**: `src/proxy.ts` (URLs compartilhadas) e `app/(main)/layout.tsx` (moldura), pela mesma função
   `resolveRequestVersion`. Prioridade: cookie + permissão > padrão (`v2`).
4. **Rotas compartilhadas** (`/`, `/carrinho`, `/conversas`): o endereço **não muda**. Para a v3 o proxy faz *rewrite*
   interno (`/` → `/v3`, `/carrinho` → `/v3/carrinho`...). `registry.ts › VERSION_ROUTES` é o mapa.
5. **Moldura da 3.0 para TODAS as páginas.** Na 3.0, `VersionFrame` (em `app/(main)/layout.tsx`) abre qualquer página
   dentro da casca persistente (navbar + drawer). O componente `Header` da 2.0 detecta a casca (`InsideShell`) e se
   apresenta compacto (voltar/título + abas + busca). Telas cheias (mapas) abrem na casca e começam abaixo da navbar
   usando a variável CSS `--shell-top` (`top-[var(--shell-top,0px)]`). Única exceção hoje: o link público do
   entregador (`registry.ts › SHELL_EXCLUDED`).
   Páginas só da 3.0 (`V3_ONLY_*`) sempre usam a casca.
6. **Endereços internos** (`/v3/...`): digitar direto sem ter a 3.0 redireciona ao canônico (sem loop).
7. **Trocar**: `switchVersion(target, ...)` (`versions/client.tsx`) grava cookie + perfil e faz um carregamento
   completo na página equivalente (ou na home da versão de destino). Sessão (cookies do Supabase) não é tocada.
8. **Sincronia**: `VersionSync` (em `app/providers.tsx`) — com permissão e sem cookie neste aparelho, adota a
   preferência salva; com cookie e sem preferência salva, salva; sem permissão, remove o cookie `v3`.

### Onde fica o seletor (um mecanismo, três lugares)

- **2.0**: `components/ProfileDashboard/UiVersionCard.tsx` ("Experimentar o iUser 3.0"), dentro do `ProfileDashboard` —
  só para quem tem permissão.
- **2.0, administrador**: botão flutuante **v3** no canto superior esquerdo da homepage (`components/AdminV3Button.tsx`).
- **3.0**: item "Voltar para a versão 2.0" no fim do drawer (`versions/v3/shell/ModeShell.tsx`).
- Admin libera/remove perfis e liga "para todos" em **Admin → Interface 3.0** (`/api/admin/ui-access`).

### Adicionar uma versão nova (ex.: `v4`)

1. `registry.ts`: incluir o id em `UiVersion`, em `UI_VERSIONS` e, se tiver URLs compartilhadas, em `VERSION_ROUTES`
   / `INTERNAL_PREFIX`.
2. Criar `src/versions/v4/` (casca, páginas) e as rotas internas `/v4/...` em `app/`.
3. Reaproveitar `versions/shared/screens` e `modules` — não copiar regra.
4. Cobrir em `scripts/test-versions.mjs`.

## 6. Convenções

- Idioma da interface e dos comentários: **português**. Identificadores de código: inglês ou português já em uso na
  área (não renomear só por estilo).
- Componentes: `PascalCase.tsx`. Hooks: `useAlgo.ts`. Funções puras: `camelCase.ts`.
- Dinheiro em centavos e percentuais em pontos-base (ver `CLAUDE.md`). Nunca fixar regra de negócio em TS/React.
- Novo serviço externo pago → linha em `service_expenses` (ver `CLAUDE.md`).
- Nova página de 1 segmento na raiz → `IGNORED_ROUTES` em `src/proxy.ts`; nova rota fixa aninhada → entrada própria.

## 7. Testes e evolução

- Regras puras: `node --test` em `scripts/` (`npm run test:versions`, `test:graduation`, `test:fare`).
- Banco: cenários SQL em `supabase/tests/` rodados dentro de `begin; ... rollback;`.
- Tipos: `npx tsc --noEmit`. Build: `npx next build`.
- Mudanças de esquema: **sempre** migration em `supabase/migrations/`, aplicada com
  `env -u SUPABASE_ACCESS_TOKEN npx supabase db push`.
- Evolução: ao tocar num domínio com regra rica, extrair para `modules/<dominio>` com testes; ao migrar uma página da
  v2 para a v3, registrar a rota em `VERSION_ROUTES` e mover a lógica para `shared/screens` ou `modules`.
