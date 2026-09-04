<div align="center">

<img src="public/logotransparente.png" alt="iUser" width="120" />

# iUser

**Marketplace local + rede de serviços sob demanda.**
Lojas, produtos, corridas, serviços, agenda e comunidades — em um único PWA.

[![Live](https://img.shields.io/badge/live-iuser.com.br-f97316?style=for-the-badge)](https://iuser.com.br)
[![Next.js](https://img.shields.io/badge/Next.js%2016-000?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React%2018-20232a?style=for-the-badge&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-3ecf8e?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![Tailwind](https://img.shields.io/badge/Tailwind-06b6d4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Mapbox](https://img.shields.io/badge/Mapbox%20GL-000?style=for-the-badge&logo=mapbox)](https://mapbox.com)
[![Vercel](https://img.shields.io/badge/Vercel-000?style=for-the-badge&logo=vercel)](https://vercel.com)

</div>

---

## O que é

O **iUser** conecta quem precisa com quem oferece, dentro da mesma cidade. Um comerciante cria a loja
e vende; um prestador se cadastra como parceiro e recebe pedidos de serviço; um usuário comum acha
tudo isso em um mapa ao vivo — e ainda agenda compromissos, conversa na comunidade da cidade e ganha
comissão por indicação.

Não é um CRUD de exemplo: é um produto em produção, com autenticação real, comissões por venda,
notificações push, geolocalização e uma rede de indicação multinível modelada dentro do Postgres.

> **Em números:** 30 rotas · 159 arquivos TypeScript · ~68.500 linhas · 28 tabelas ·
> 133 políticas de RLS · 11 funções PL/pgSQL · 26 migrations versionadas

---

## Destaques técnicos

Os pontos que costumam render conversa em uma entrevista técnica:

| Desafio | Como foi resolvido |
| --- | --- |
| **Rede de indicação multinível (MLM)** | Árvore de perfis modelada com a extensão **`ltree`** do Postgres + índice **GiST**. A distância entre comprador e patrocinador (`nlevel(buyer.path) - nlevel(p.path)`) define o percentual da comissão, e um **trigger** em `sales` distribui os valores automaticamente no momento da venda. |
| **Slugs globais únicos** | Perfis, lojas e publicações dividem o mesmo espaço de nomes (`/nome-da-pessoa`, `/loja/produto`). As funções `generate_clean_slug` (com `unaccent`) e `is_slug_taken_globally` garantem URLs limpas e sem colisão entre entidades diferentes. |
| **Segurança no banco, não no cliente** | **133 políticas de Row Level Security** — cada tabela decide sozinha quem lê e quem escreve. O front-end nunca é a fronteira de segurança. |
| **Tempo real** | Supabase Realtime (`postgres_changes`) alimenta pedidos da loja, contador de visitantes, sacola, radar e o chat das comunidades — sem polling. |
| **Mapa vivo** | **Mapbox GL** renderiza lojas, serviços e produtos por camada, com geolocalização, parsing tolerante de coordenadas (GeoJSON, WKT e WKB hexadecimal vindos do PostGIS) e status de "aberto agora" calculado a partir dos horários de funcionamento. |
| **Roteamento com alternativas e ETA** | O fluxo de corrida traça a rota, oferece caminhos alternativos e estima tempo e preço antes de o pedido ser enviado. |
| **Push nativo na web** | Web Push com VAPID (`web-push`) e service worker próprio: convites de compromisso e novos pedidos chegam com o app fechado. |
| **SEO programático** | `sitemap.ts` gera o mapa do site a partir do banco (todos os perfis, lojas e produtos), com `robots.ts` e OpenGraph completos. |
| **UX de app, não de site** | PWA instalável, home com seções reordenáveis pelo próprio usuário, tema claro/escuro, animações com Framer Motion e feedback com Sonner. |

---

## Funcionalidades

<details open>
<summary><b>🛍️ Marketplace</b></summary>

- Criação de loja com endereço no mapa, descrição, horários, formas de pagamento e regras de entrega
- Catálogo de produtos com fotos, categorias e página pública por produto
- Sacola, checkout e acompanhamento de pedidos em tempo real
- Venda presencial pelo painel do lojista
- Avaliações de loja e de produto, com médias mantidas por trigger
- Lojas em destaque, navegação por categoria e busca global

</details>

<details open>
<summary><b>🚗 Motorista particular</b></summary>

- `/pedir-motorista`: wizard de 3 passos que separa transporte de **pessoa** e de **objeto**
- Origens e destinos recentes viram atalhos na home
- Rotas alternativas, ETA e resumo do pedido em linguagem clara
- Adicionais (bagagem, cadeirinha, pet) em subformulários
- Calculadora de corrida independente, com Leaflet
- Lembretes de segurança (placa e cor do veículo) dentro do fluxo

</details>

<details open>
<summary><b>🔧 Serviços sob demanda</b></summary>

- `/pedir-servico`: publique o que precisa, com local e descrição
- `/ser-parceiro-iuser`: mural de pedidos abertos onde os parceiros se candidatam
- Fluxo completo de candidatura → aceitar/recusar, visível para as duas pontas
- Login sem sair da página do parceiro

</details>

<details open>
<summary><b>📅 Agenda e comunidade</b></summary>

- Compromissos com convite, confirmação e **push notification**
- Dias e horários de atendimento por perfil e por loja
- Comunidades: salas de conversa por cidade, com mensagens em tempo real
- Mural social: posts, curtidas, comentários, seguidores e publicações em destaque

</details>

<details open>
<summary><b>📈 Painéis e rede</b></summary>

- Dashboard de perfil e de loja com visitantes ao vivo, vendas e pedidos
- Gestão de funcionários
- Rede de indicação: convite por link, cookie de referral, downline e comissões acumuladas

</details>

---

## Stack

| Camada | Tecnologias |
| --- | --- |
| **Front-end** | Next.js 16 (App Router, Server Components, route groups), React 18, TypeScript `strict` |
| **Estilo** | Tailwind CSS, `class-variance-authority`, `tailwind-merge`, Framer Motion, Lucide |
| **Estado** | Zustand (carrinho, modo do app, publicações, fontes), TanStack Query, React Context |
| **Back-end** | Supabase — Postgres, Auth, Realtime, Storage e RPC, com `@supabase/ssr` para sessão no servidor |
| **Banco** | PL/pgSQL, triggers, RLS, extensões `ltree` / `unaccent` / PostGIS, 26 migrations |
| **Mapas** | Mapbox GL JS, Leaflet + React-Leaflet |
| **Notificações** | Web Push (VAPID), service worker, Sonner |
| **Infra** | Vercel (deploy contínuo a partir da `main`), Supabase CLI |

---

## Estrutura

```
src/
├─ app/
│  ├─ (auth)/                 login, cadastro, recuperação de senha
│  ├─ (main)/
│  │  ├─ inicio/sections/     seções reordenáveis da home
│  │  ├─ [ownerSlug]/         perfil, catálogo e páginas públicas por slug
│  │  ├─ radar/               mapa Mapbox de lojas, serviços e produtos
│  │  ├─ pedir-motorista/     wizard de corrida (pessoa | objeto)
│  │  ├─ pedir-servico/       solicitação de serviço
│  │  ├─ ser-parceiro-iuser/  mural de pedidos e candidaturas
│  │  ├─ comunidade/          salas de conversa por cidade
│  │  ├─ compromissos/        agenda e convites
│  │  └─ ...                  lojas, sacola, pedidos, publicações, social
│  ├─ api/push/               subscribe, unsubscribe e envio de notificações
│  ├─ api/*-referral-cookie/  rastreamento de indicação
│  ├─ sitemap.ts              sitemap gerado a partir do banco
│  └─ layout.tsx              metadata, OpenGraph e PWA
├─ components/                UI compartilhada
├─ hooks/                     usePushNotifications
├─ lib/                       supabase, geo, slugs, horários, WhatsApp, imagens
└─ store/                     stores Zustand

supabase/migrations/          26 migrations versionadas
```

---

## Rodando localmente

```bash
git clone https://github.com/ncastelano/iuser.git
cd iuser
npm install
```

Crie um `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_MAPBOX_TOKEN=...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

Aplique o schema e suba o servidor:

```bash
npx supabase db push
npm run dev
```

A aplicação sobe em `http://localhost:3000`. O dev server escuta em `0.0.0.0`, então dá para abrir
pelo celular na mesma rede — útil para testar o PWA, o push e a geolocalização.

---

## Roadmap

- [ ] Pagamento integrado no checkout
- [ ] Rastreamento da corrida em tempo real no mapa
- [ ] Reputação e histórico público do parceiro de serviço
- [ ] App nativo a partir do PWA

---

<div align="center">

Feito por [@ncastelano](https://github.com/ncastelano) · [iuser.com.br](https://iuser.com.br)

</div>
