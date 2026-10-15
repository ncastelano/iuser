# 0001 — Versionamento da interface (2.0 / 3.0) no mesmo projeto

**Status:** aceita · **Data:** 2026-10-15

## Contexto
A interface 3.0 (navbar + drawer + home nova) precisa conviver com a 2.0 enquanto é construída, com a escolha na mão
da pessoa, sem duplicar o app, sem quebrar links existentes e sem tocar em dados/permissões.

## Decisão
- Versões internas `v2` (atual, preservada) e `v3`, registradas em `src/versions/registry.ts`.
- Escolha em **cookie** (`iuser_ui`) + `profiles.preferred_version` (logado). Oferta controlada por `feature_flags.ui_v3`.
- Resolução **centralizada no `proxy.ts`**, por *rewrite* das URLs compartilhadas (`/`, `/carrinho`, `/conversas`).
  URL pública não muda. Implementações 3.0 vivem em `/v3/*` (internas).
- Telas com a mesma lógica nas duas versões vivem em `versions/shared/screens` e recebem `ui` (muda só a moldura).
- Troca por carregamento completo (`location.assign`) para a página equivalente ou a home da versão de destino.
- Padrão para quem nunca escolheu: **v2**.

## Alternativas consideradas
- **Duas árvores `app/` completas / segmento `[version]` na raiz** — duplica páginas e quebra o roteamento manual do
  `proxy.ts` (que resolve `/{slug}` de perfil/loja). Rejeitado.
- **Condicionais de versão dentro de cada página** — espalha a decisão e vira dívida. Rejeitado.
- **Subdomínio `v3.`** — separa sessão/cookies e complica PWA/Capacitor. Rejeitado.
- **Só `localStorage`** — o servidor (proxy) não enxerga; causaria flash e SSR inconsistente. Rejeitado.

## Consequências
- Página que existe só na v2 continua abrindo na v2 mesmo para quem usa a 3.0 (sem navbar nova até ser migrada).
- `/v3/*` é um detalhe interno: nunca divulgar esses endereços.
- A migration é aditiva e reversível (`DROP COLUMN preferred_version`; função e flag podem ser removidas).
