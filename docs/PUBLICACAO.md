# Roteiro de publicação — staging → produção

Levantado em **2026-11-02**. Fonte dos fatos: execuções reais dos workflows no GitHub (`Banco de staging`, `Banco de produção`, `CI`) e o histórico git. O fluxo-padrão está em `docs/STAGING.md` (seção 5); este arquivo aplica ele ao que está pendente **agora**.

## 1. Onde estamos

| | Estado |
|---|---|
| **Banco de produção** | Já tem tudo até a `20261129` (aplicado em 19, 25 e 26/10 pelo workflow aprovado). Isso inclui a `20261123`, que **já liberou a 3.0 para todos**. |
| **Faltam na produção** | **18 migrations**: `20261130000000` até `20261130000017` (lista no Anexo A). |
| **Banco de staging** | Tem tudo até a `20261130000016` (workflow verde em 29/10). A `...17` (promoções) **falhou** em 02/11, duas vezes. |
| **Código** | A `main` está **123 commits atrás** da `staging` (357 arquivos, +21 mil / −2 mil linhas). |
| **CI** | Verde nos últimos pushes da `staging`. |

> A lista "Pendentes para produção" que existia no `CLAUDE.md` e no manual (PRD-3) estava desatualizada: citava migrations que a produção já recebeu. Foi corrigida junto com este roteiro.

## 2. O que trava hoje (resolver ANTES de tudo)

Os dois workflows de banco (staging e produção) instalam o Supabase CLI na versão **"latest"**. Uma versão nova do CLI passou a recusar o arquivo `supabase/config.toml` (erro: `[inbucket] in supabase/config.toml is no longer supported. Use [local_smtp] instead`) e o comando morre em ~1 segundo, **antes de aplicar qualquer migration**. Nas execuções de 29/10 essa mensagem não existia; nas de 02/11 existe.

Consequência: o staging não recebe a `...17` e o workflow de produção **também falharia**, e ele recusa de qualquer jeito aplicar algo que o staging ainda não tem.

**Conserto sugerido (pequeno, só nos 2 arquivos de workflow):** fixar a versão do CLI em vez de usar "latest", na versão que roda localmente e lê o `config.toml` atual (2.95.5):

```yaml
- uses: supabase/setup-cli@v1
  with:
    version: 2.95.5
```

(`.github/workflows/db-staging.yml` e `.github/workflows/db-production.yml`.) A alternativa é trocar `[inbucket]` por `[local_smtp]` no `config.toml`, mas isso muda o arquivo que o ambiente local também lê — prefira fixar a versão.

**Depois do conserto:** GitHub → Actions → **Banco de staging** → *Run workflow*. Deve ficar verde e aplicar só a `20261130000017`.

## 3. Fases

### Fase 0 — Destravar o pipeline
- [ ] Fixar a versão do CLI nos dois workflows (seção 2) e fazer push na `staging`.
- [ ] Rodar **Banco de staging** à mão. Confirmar verde e que a `...17` entrou.

### Fase 1 — Testar no staging (aqui pode escrever no banco)
O que já passou: tudo foi testado no **banco local** (cenários de banco em transação desfeita + testes de regra). O que **nunca** rodou fora do local é o app de ponta a ponta contra o banco de staging. Faça nas contas de teste do staging (`docs/STAGING.md`):

- [ ] **O app de teste abre?** O staging teve bloqueio de cota (erro 402). Abra o preview da branch `staging`; se ainda der 402, resolva isso antes (a cota do Supabase renova por ciclo) — sem staging utilizável não há como fazer o resto com segurança.
- [ ] **Entrega de loja, ponta a ponta:** pedido → loja aceita → motorista aceita → chega na loja → loja informa o código → motorista confirma retirada → "Estou no local" → cliente informa o código de entrega → concluída. (Cobre as migrations 03, 06, 11.)
- [ ] **Dinheiro na porta e maquininha:** entrega com pagamento em dinheiro gera repasse; a loja confirma; motorista com pendência vencida não aceita nova entrega. Contestação de entrega pelo cliente e decisão no Admin → Disputas. (Migration 12.)
- [ ] **Motoristas favoritos:** loja convida, motorista aceita, a entrega aparece só para ele durante a janela. (09)
- [ ] **Avisos na ilha** de pedido/entrega e **push** (só se as chaves de push do staging existirem). (04, 10)
- [ ] **Denunciar:** 3 contas diferentes denunciam um flash → some; Admin → Denúncias restaura. (13)
- [ ] **Flash e Social:** postar, curtir, comentar, "pessoas perto". (00, 01)
- [ ] **Produto digital:** criar curso, enviar vídeo, marcar a prévia, comprar com Pix, **Liberar acesso**, assistir na sala de aula; prévia nos cartões da home. (14, 15, 16)
- [ ] **Promoções:** montar um combo, enviar foto, ver no catálogo e na home, comprar o combo. (17)
- [ ] **Catálogo:** abas Produtos/Digitais/Serviços, sacola em barra com Finalizar, adicionais antes da observação. (só código)
- [ ] Ensaiar **um** rollback no staging (sugestão: `supabase/rollbacks/store_promotions_rollback.sql`) e reaplicar a migration.

### Fase 2 — Qualidade antes do PR
Na máquina local (pare o `next dev` antes do build; os dois usam `.next`):
```bash
npx tsc --noEmit
npm run test:versions && npm run test:checkout-v2 && npm run test:security-exposure
npm run test:promotions && npm run test:digital && npm run test:deliveries
npx next build
npx madge --circular --extensions ts,tsx --ts-config tsconfig.json src/versions   # só o ciclo conhecido
```
- [ ] **`npx next build` passa.** (Não foi rodado nas últimas rodadas; só o `tsc`. O build de produção é mais exigente.)
- [ ] Abrir o **PR `staging` → `main`**; CI verde. Escreva na descrição as 18 migrations e o aviso da Fase 3.

### Fase 3 — O dia da publicação (nesta ordem, sem pausas longas entre os passos 3 e 4)
1. **Horário calmo.** Confirme que **não há entrega de loja em andamento**. Motivo: veja "riscos" abaixo — por alguns minutos o banco novo e o código antigo convivem. Consulta só de leitura (Supabase → SQL Editor, projeto de produção; o resultado deve ser `0`):
   ```sql
   select count(*) from ride_requests where order_id is not null and status in ('pending', 'accepted');
   ```
2. *(Opcional, só para o Manual do admin)* No Vercel, ambiente de produção: `MANUAL_SECRET` (32+ caracteres, guardado fora do repositório; **perder = perder o manual**) e `MANUAL_ORIGINS=https://www.iuser.com.br`. Sem elas o cofre do manual fica fechado, mas o resto funciona.
3. **Banco primeiro:** Actions → **Banco de produção** → *Run workflow* → digite `APLICAR` → o revisor aprova. Leia o *dry-run*: devem aparecer **exatamente as 18** (`20261130000000` … `20261130000017`) e nenhuma outra.
4. **Código depois:** mesclar o PR em `main` (a Vercel publica). Acompanhe até o deploy ficar verde.
5. *(Se fez o passo 2)* Cadastrar o primeiro aparelho do manual e rodar `node scripts/local/seed-manual.mjs --remote`.

### Fase 4 — Conferir a produção (SÓ OLHAR: regra do projeto = teste que escreve no banco nunca roda em produção)
- [ ] Abrir home (2.0 e 3.0), `/social`, `/flash`, um catálogo, uma página de produto, `/carrinho`.
- [ ] Home com a seção **Promoções das lojas** (só aparece se alguma loja já tiver combo/desconto).
- [ ] Vercel → *Logs*/Supabase → *Logs* e *Advisors*: sem erros novos de função inexistente (`function ... does not exist`) nem de coluna (`column ... does not exist`).
- [ ] Banco: os jobs do `pg_cron` novos existem (`favorite-windows-tick`) e os buckets `flash-media`, `delivery-proofs` e `digital-files` (privado) foram criados.
- [ ] Conferir que o `notify_url` está preenchido (os avisos/push de entrega reaproveitam esse endereço). Só leitura: `select notify_url from delivery_dispatch_settings;` (o valor não pode ser vazio).

## 4. Riscos específicos (nem toda migration "só adiciona")

A regra de ouro é "o banco só adiciona". Estas **mudam o comportamento de funções que o código antigo usa**, então enquanto o código novo não está no ar, o app antigo pode errar nelas:

| Migration | O que muda para o código antigo |
|---|---|
| `...03` retirada por código | O motorista deixa de gravar `ride_started_at` direto em corrida de pedido (erro `pickup_code_required`). |
| `...06` "Estou no local" | `complete_ride` passa a exigir o aviso de chegada (erro `arrival_required`). |
| `...11` prova de entrega | `complete_ride` passa a exigir o código/foto (erro `proof_required`). |
| `...12` caixa e disputas | Aceitar entrega pode ser recusado por pendência do motorista. |
| `...09` favoritos / `...13` moderação | Mudam políticas de leitura (`ride_offers`, flashes, comentários); sem favoritos/denúncias o efeito é nulo. |

**Mitigação:** janela curta entre os passos 3 e 4 da Fase 3, horário calmo e nenhuma entrega de loja em andamento. Se uma entrega ficar travada nesse intervalo, ela volta a funcionar assim que o código novo entra.

## 5. Se algo der errado

| Problema | Como voltar |
|---|---|
| **Código ruim** | Vercel → *Deployments* → deploy anterior → *Instant Rollback* (segundos, sem mexer no banco). Depois `git revert`. |
| **Migration ruim** | Cada uma tem rollback em `supabase/rollbacks/` (nomes no Anexo A). **Ensaie no staging antes**; desfazer na ordem inversa. Rollback que remove coluna/tabela apaga os dados dela. |
| **Dados estragados** | Backups diários do Supabase e PITR (ver `docs/STAGING.md` seção 6). |

## 5b. Decisões que ficam com você
- Rodar o **conserto do CLI** (seção 2) — mexe nos arquivos de workflow que também aplicam em produção.
- **Quando** publicar (a janela, por causa dos riscos acima).
- Se vai configurar o **Manual do admin** em produção agora ou deixar para depois.

## Anexo A — As 18 migrations que faltam na produção

Ordem de aplicação = ordem da tabela. "Rollback" é o arquivo em `supabase/rollbacks/`.

| # | Migration | O que entrega | Rollback |
|---|---|---|---|
| 00 | `flash` | Flash: tabelas, bucket `flash-media`, feed | `flash_rollback.sql` |
| 01 | `people_discovery` | Social: pessoas perto, locais | `people_discovery_rollback.sql` |
| 02 | `driver_delivery_capacity` | Mochila (nº de entregas) do motorista | `driver_delivery_capacity_rollback.sql` |
| 03 | `delivery_handoff` | Volume, retirada por código, painel de entregas da loja ⚠ | `delivery_handoff_rollback.sql` |
| 04 | `live_order_events` | Avisos ao vivo de pedido/entrega na ilha | `live_order_events_rollback.sql` |
| 05 | `admin_manual_vault` | Cofre do manual do admin | `admin_manual_vault_rollback.sql` |
| 06 | `delivery_arrival` | "Estou no local" ⚠ | `delivery_arrival_rollback.sql` |
| 07 | `delivery_pickup_status` | Pronto/em preparo na tela do motorista | `delivery_pickup_status_rollback.sql` |
| 08 | `delivery_messages` | Conversa rápida da entrega | `delivery_messages_rollback.sql` |
| 09 | `store_favorite_drivers` | Motoristas favoritos da loja ⚠ | `store_favorite_drivers_rollback.sql` |
| 10 | `live_push` | Push dos avisos da ilha | `live_push_rollback.sql` |
| 11 | `delivery_proof` | Prova de entrega (código/foto) ⚠ | `delivery_proof_rollback.sql` |
| 12 | `delivery_dues_disputes` | Caixa do entregador e contestação ⚠ | `delivery_dues_disputes_rollback.sql` |
| 13 | `moderation` | Denunciar e ocultar ⚠ | `moderation_rollback.sql` |
| 14 | `digital_products` | Produtos digitais, bucket privado | `digital_products_rollback.sql` |
| 15 | `digital_showcase` | Vitrine dos digitais | `digital_showcase_rollback.sql` |
| 16 | `digital_preview` | Prévia em vídeo dos digitais | `digital_preview_rollback.sql` |
| 17 | `store_promotions` | Promoções (combos), foto do combo | `store_promotions_rollback.sql` |

⚠ = muda o comportamento de algo que o código antigo já usa (seção 4).

## Anexo B — O que NÃO muda com esta publicação
- **Pagamento dos digitais continua declarado** (Pix para a loja, ela libera o acesso). A taxa do iUser (R$ 0,50 no pós-pago) **ainda não é cobrada**; a cobrança automática (Asaas) é uma etapa futura.
- **V2 do fluxo de entrega** (busca dinâmica, reserva, pagamento declaratório) segue **desligado**.
- A `20261123` (3.0 para todos) **não faz parte** deste lote: já foi aplicada em 25/10.
