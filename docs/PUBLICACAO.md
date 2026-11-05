# Roteiro de publicação — staging → produção

Levantado em **2026-11-02**. Fonte dos fatos: execuções reais dos workflows no GitHub (`Banco de staging`, `Banco de produção`, `CI`) e o histórico git. O fluxo-padrão está em `docs/STAGING.md` (seção 5); este arquivo aplica ele ao que está pendente **agora**.

## 1. Onde estamos

| | Estado |
|---|---|
| **Banco de produção** | Já tem tudo até a `20261129` (aplicado em 19, 25 e 26/10 pelo workflow aprovado). Isso inclui a `20261123`, que **já liberou a 3.0 para todos**. |
| **Faltam na produção** | **41 migrations**: `20261130000000` até `20261130000040` (lista no Anexo A). |
| **Banco de staging** | Tem as 18 primeiras (a `...17` entrou em 02/11 depois do conserto do CLI, execução 41460638773). A `...18` (limites de upload) entrou em 02/11. A `...19` (catálogo e registro de uploads) entrou em 02/11. A `...20` (autorização, cotas e bloqueios) entrou em 02/11. A `...21` (painel Admin → Uploads) entrou em 02/11. A `...22` (limpeza de arquivos sem uso) entra quando a `staging` receber o push. |
| **Código** | A `main` está **123 commits atrás** da `staging` (357 arquivos, +21 mil / −2 mil linhas). |
| **CI** | Verde nos últimos pushes da `staging`. |
| **Cota do Supabase (API)** | **BLOQUEADA em staging E em produção** (verificado em 02/11/2026): toda chamada de dados devolve **HTTP 402** `exceed_cached_egress_quota` — "o dono do projeto precisa fazer upgrade do plano ou remover os limites de gasto". O app do preview abre, mas sem nenhum dado. Veja a seção 2b. |

> A lista "Pendentes para produção" que existia no `CLAUDE.md` e no manual (PRD-3) estava desatualizada: citava migrations que a produção já recebeu. Foi corrigida junto com este roteiro.

## 2. O que travava (RESOLVIDO em 02/11/2026)

Os dois workflows de banco (staging e produção) instalam o Supabase CLI na versão **"latest"**. Uma versão nova do CLI passou a recusar o arquivo `supabase/config.toml` (erro: `[inbucket] in supabase/config.toml is no longer supported. Use [local_smtp] instead`) e o comando morre em ~1 segundo, **antes de aplicar qualquer migration**. Nas execuções de 29/10 essa mensagem não existia; nas de 02/11 existe.

Consequência: o staging não recebe a `...17` e o workflow de produção **também falharia**, e ele recusa de qualquer jeito aplicar algo que o staging ainda não tem.

**Conserto aplicado (commit `cc8b0605`, só nos 2 arquivos de workflow):** fixou a versão do CLI em vez de usar "latest", na versão que roda localmente e lê o `config.toml` atual (2.95.5):

```yaml
- uses: supabase/setup-cli@v1
  with:
    version: 2.95.5
```

(`.github/workflows/db-staging.yml` e `.github/workflows/db-production.yml`.) A alternativa é trocar `[inbucket]` por `[local_smtp]` no `config.toml`, mas isso muda o arquivo que o ambiente local também lê — prefira fixar a versão.

**Depois do conserto:** GitHub → Actions → **Banco de staging** → *Run workflow*. Deve ficar verde e aplicar só a `20261130000017`.

## 2b. O bloqueio maior: a cota do Supabase (402) — staging e produção

Em 02/11/2026, depois do login na Vercel, o preview do staging carrega a tela (faixa "AMBIENTE DE TESTE"), mas **todas** as chamadas ao banco falham com 402. Uma consulta de leitura ao projeto de produção (o do `.env.local`, que o `CLAUDE.md` identifica como produção) deu **o mesmo 402**. Ou seja:

- **Publicar o código não resolve nada para os usuários enquanto a cota estiver estourada**: o app não consegue ler dados.
- **Não dá para testar no staging** (Fase 1) enquanto isso durar.
- As conexões **diretas ao banco** (os workflows de migration, que usam a senha do pooler) continuam funcionando; o bloqueio é só da **API** (REST/Auth/Storage).
- Nota de correção: um teste anterior sem chave de API devolveu 401 e eu li isso como "liberado". Era só o portão da API, que vem **antes** da checagem de cota. O teste que vale é uma chamada com a chave pública, e ela dá 402.

**O que o painel de uso do Supabase mostra (conferido em 02/11/2026):**
- Plano **Free**, ciclo **13/10 a 13/11/2026**. O aviso no topo diz: "Services restricted — your projects are unable to serve requests as your organization has used up its quota". É bloqueio **da organização** (3 projetos), por isso staging e produção caem juntos.
- **Cached Egress: 13,94 GB de 5 GB incluídos** (excedeu 8,94 GB). O Egress comum (sem cache) é só 0,58 GB, e o resto é minúsculo: banco 64 MB, storage 55 MB, 9 usuários ativos no mês, 236 mensagens de realtime.
- **Quando foi o consumo** (gráfico diário): 13/10 ≈ 0,2 GB · 14/10 ≈ 0,1 · **15/10 ≈ 3,7 GB** · **16/10 ≈ 6 GB** · 17/10 ≈ 1,7 · 18/10 ≈ 0,9 · 19/10 ≈ 0,5 · 20 e 21/10 ≈ 0 (já bloqueado). Ou seja, **cerca de 80% do consumo foi em 15 e 16/10**, antes do acidente de 18/10 e do proxy de imagens (aplicado em produção em 19/10).
- **Renovação: 13/11/2026.** Depois disso o ciclo zera e o bloqueio some sozinho.
- O gráfico não mostra o que consumiu (API × imagens). Como o uso real é pequeno (9 usuários), tudo indica que foi um pico pontual daquela semana (testes e simuladores falando com o banco de produção) e não o uso normal. **Não dá para provar:** o projeto está bloqueado desde 21/10 e ninguém mediu o consumo depois do proxy de imagens.

**Como sair (decisão sua, envolve dinheiro):** Supabase → Organization → Billing: (a) fazer upgrade do plano, ou (b) se já está no Pro, remover o *spend cap*; ou (c) esperar a renovação em **13/11** (faltam 11 dias; o site e o staging ficam sem dados até lá), sabendo que o consumo pode estourar de novo se o padrão de 15/16 de outubro se repetir. O *Cached Egress* alto vem de imagens e dados baixados pelos navegadores; o proxy de imagens `/img` (cache da Vercel) já reduz isso, mas não elimina. Acompanhe depois em Admin → Financeiro (telemetria própria de egress).

**Enquanto não liberar:** a Fase 1 só pode ser feita no ambiente local (já feita, em transações desfeitas) e a publicação em produção fica **sem como ser conferida**. Recomendo **não publicar o código antes de a API voltar**.

## 3. Fases

### Fase 0 — Destravar o pipeline
- [x] Fixar a versão do CLI nos dois workflows (seção 2) e fazer push na `staging`. *(feito)*
- [x] Rodar **Banco de staging** à mão. Verde, e a `...17` entrou. *(feito)*

### Fase 1 — Testar no staging (aqui pode escrever no banco)
O que já passou: tudo foi testado no **banco local** (cenários de banco em transação desfeita + testes de regra). O que **nunca** rodou fora do local é o app de ponta a ponta contra o banco de staging. Faça nas contas de teste do staging (`docs/STAGING.md`):

- [ ] **O app de teste abre?** *(02/11: a tela abre, mas toda chamada de dados dá 402 — ver seção 2b. Este item só fecha quando a API voltar.)* Abra o preview da branch `staging` (endereço no painel da Vercel → Deployments; exige login na Vercel). Teste de verdade = a home mostra lojas e produtos, sem erro 402 no console.
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
- [ ] Abrir o **PR `staging` → `main`**; CI verde. Escreva na descrição as 35 migrations e o aviso da Fase 3.

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
- **Quando** publicar (a janela, por causa dos riscos acima).
- Se vai configurar o **Manual do admin** em produção agora ou deixar para depois.

## Anexo A — As 27 migrations que faltam na produção

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
| 18 | `storage_bucket_limits` | Limite de tamanho (5–6 MB) e de tipo (JPG/PNG/WebP/GIF/AVIF) nos 12 buckets de foto ⚠ | `storage_bucket_limits_rollback.sql` |
| 19 | `upload_catalog` | Catálogo de tipos de upload (`upload_kinds`, com provedor), registro de arquivos (`media_assets`) e Cloudflare/domínio em Financeiro | `upload_catalog_rollback.sql` |
| 20 | `upload_authorization` | Autorização de envio, ritmo e cotas por pessoa, bloqueios e interruptor "envio só com autorização" (nasce DESLIGADO) ⚠ | `upload_authorization_rollback.sql` |
| 21 | `upload_admin` | Painel Admin → Uploads: registro de recusas, leituras agregadas e `authorize_upload` como embrulho do núcleo | `upload_admin_rollback.sql` |
| 22 | `upload_cleanup` | Limpeza de arquivos sem uso (nasce DESLIGADA, só simula), conferência diária de arquivos que sumiram (`pg_cron`) e o cartão do painel | `upload_cleanup_rollback.sql` |
| 23 | `upload_r2` | Envio pelo Cloudflare R2 (vídeo e música): a autorização aceita o provedor r2, tipo `media_r2` (nasce DESLIGADO) e `register_r2_asset` | `upload_r2_rollback.sql` |
| 24 | `flash_r2` | Flash com vídeo no R2: trava no banco (só vídeo registrado pela mesma pessoa) e liberação do arquivo ao apagar o flash | `flash_r2_rollback.sql` |
| 25 | `appointment_deposit_anon_revoke` | Tira de `anon` o EXECUTE das 4 funções da entrada no agendamento (nada vazava; era defesa em profundidade que o teste de exposição cobrou) | `appointment_deposit_anon_revoke_rollback.sql` |
| 26 | `r2_cleanup` | Limpeza de sem-uso também no R2: vídeo registrado que ninguém usa e objeto solto (envio abandonado); só vídeo, nasce desligada | `r2_cleanup_rollback.sql` |
| 27 | `digital_free_music` | Digital GRÁTIS (pegar sem pedido: `digital_claims`/`claim_free_digital`), prévia em ÁUDIO de até 30 s e declaração de autoria antes de enviar música (`digital_rights`) | `digital_free_music_rollback.sql` |
| 28 | `digital_moderation` | Denunciar produto digital (tipo `digital_product`, motivo Direito autoral); oculto = inativo + arquivos deixam de ser entregues a quem não é o dono | `digital_moderation_rollback.sql` |
| 29 | `store_tips` | Gorjeta / apoiar o artista: Pix direto para a loja, declarado pela pessoa e confirmado pela loja (`store_tips`, `store_tip_settings`) | `store_tips_rollback.sql` |
| 30 | `digital_apps` | Programas e aplicativos para baixar (item `app` com plataforma, versão, notas, SHA-256, contador de downloads) e CORREÇÃO DE SEGURANÇA do gatilho de conteúdo digital (`current_user` → `auth.role()`) | `digital_apps_rollback.sql` |
| 31 | `digital_limits_split` | Limites do digital por tipo (música/programa/curso+arquivos, buckets e cotas próprios, provisórios do plano gratuito), `digital_contents.bucket`, "Meu espaço" (`get_my_upload_limits`) e estimativa de banda dos programas (`admin_download_bandwidth`) | `digital_limits_split_rollback.sql` |
| 32 | `upload_valve` | Válvula de segurança dos uploads: mede armazenamento e banda contra a cota e, LIGADA, pausa sozinha os envios digitais/R2 (e o Flash no crítico), religa com histerese; tabelas `upload_valve_settings`/`upload_valve_events`, cron `upload-valve-tick`; nasce desligada | `upload_valve_rollback.sql` |
| 33 | `digital_r2` | Digital pesado no R2 PRIVADO (bucket `iuser-digital`, sem domínio público): tipo `digital_heavy` (nasce desligado), `digital_contents.bucket`/`file_name`, trava `digital_r2_guard`, `release_r2_asset` confere itens digitais; a banda do Supabase deixa de contar o que está no R2 | `digital_r2_rollback.sql` |
| 34 | `music_club` | Clube da loja PAGO + música: mensalidade por Pix declarado (+30 dias por confirmação), `includes_music` abre as músicas da loja (`_digital_access` reconhece o clube), taxa de R$ 0,50 no pós-pago por pagamento confirmado; `store_club_settings`, `store_club_payments` | `music_club_rollback.sql` |
| 35 | `outdoor` | Outdoor (vitrine por pontuação): tabela `outdoor_rules` (pesos), `get_outdoor`/`get_outdoor_rules` públicas; só adiciona. Home, /comprar, /social, /imoveis e o filtro do /radar chamam `get_outdoor`: aplique ANTES do código. Rollback `outdoor_rollback.sql`. |
| 36 | `search_trends` | Busca: `search_events` (buscas de pessoas logadas, sem acesso do app), `log_search`, `clear_my_searches`, `get_search_trends` (pública, mínimo de pessoas diferentes). Só adiciona; a home 3.0 chama: aplique ANTES do código. Rollback `search_trends_rollback.sql` (apaga o histórico registrado). |
| 37 | `search_all` | Busca ampla: função pública `search_all` (lojas, pessoas, produtos, serviços, publicações, digitais, imóveis, pedidos, flashes, comunidades). Só adiciona; a busca da home chama: aplique ANTES do código. Rollback `search_all_rollback.sql`. |
| 38 | `ride_negotiation` | Negociação de corridas e ganho mínimo por hora: `ride_price_offers`, `driver_earning_goals` (privada), `ride_negotiation_settings`, colunas `passenger_offer`/`agreed_price`, funções de oferta/contraproposta/aceite e o `select_ride_driver` que congela o preço. Só adiciona (o `select_ride_driver` é substituído, mesma assinatura); o app novo chama as funções: aplique ANTES do código. Rollback `ride_negotiation_rollback.sql` (apaga o histórico de propostas e os mínimos). |
| 39 | `ride_negotiation_notices` | Avisos da negociação na ilha e no push: 4 tipos novos em `profile_notifications` (o CHECK é refeito com a lista completa) e o gatilho `trg_ping_live_push` ganha os tipos. Depende da `...38`; aplique ANTES do código. Rollback `ride_negotiation_notices_rollback.sql`. |
| 40 | `store_digital_summary` | Resumo do digital no Painel da loja: a função de leitura `get_store_digital_summary` (só o dono; só números). Só LEITURA, nada novo é gravado; sem ela o bloco Digital do painel simplesmente não aparece. Aplique ANTES do código. Rollback `store_digital_summary_rollback.sql`. |

⚠ = muda o comportamento de algo que o código antigo já usa (seção 4).

## Anexo B — O que NÃO muda com esta publicação
- **Pagamento dos digitais continua declarado** (Pix para a loja, ela libera o acesso). A taxa do iUser (R$ 0,50 no pós-pago) **ainda não é cobrada**; a cobrança automática (Asaas) é uma etapa futura.
- **V2 do fluxo de entrega** (busca dinâmica, reserva, pagamento declaratório) segue **desligado**.
- A `20261123` (3.0 para todos) **não faz parte** deste lote: já foi aplicada em 25/10.


## Anexo C — DNS do `iuser.com.br` mudou de lugar (02/11/2026)
- Os servidores de DNS **não são mais da Vercel**: são `meiling.ns.cloudflare.com` e `west.ns.cloudflare.com` (trocados na Hostinger, que é quem registra o domínio; vence em 30/08/2027).
- **O site continua na Vercel.** Na Cloudflare ficam só os registros que apontam para ela: CNAME `@` → `11b345db6ba94409.vercel-dns-017.com`, CNAME `www` e `*` → `cname.vercel-dns-017.com` (todos **só DNS**, sem proxy) e os 3 CAA. Esses destinos eram os que a Vercel mostrava como "gerenciados por ela, podem mudar sem aviso": se a Vercel avisar que o domínio está mal configurado, atualize o CNAME na Cloudflare com o valor que ela indicar.
- **Mexer em registro de DNS agora é na Cloudflare**, não na Vercel nem na Hostinger (a tela de DNS delas fica sem efeito).
- Voltar atrás: na Hostinger (Domínios → iuser.com.br → DNS/Nameservers → Alterar), voltar a `ns1.vercel-dns.com` e `ns2.vercel-dns.com`.

## Anexo D — Ligar o "envio só com autorização" (só depois do código no ar)
A migration `20261130000020` troca as 5 políticas de envio do Storage, mas o interruptor `upload_settings.signed_required` **nasce desligado**: nada muda para ninguém. Para fechar o "pular o app":
1. Aplique as migrations (workflow aprovado) **e** publique o código novo (o app passa a pedir autorização antes de cada envio).
2. Confira com a conta de teste que enviar uma foto continua funcionando (perfil, produto, Flash).
3. Só então ligue, com a chave de serviço, no SQL do Supabase: `select public.admin_upload_set_enforced(true, null);`
4. Voltar atrás é um comando: `select public.admin_upload_set_enforced(false, null);` (vale na hora, sem publicar nada).
**Ligar antes do passo 1 derruba os envios de quem ainda estiver com o código antigo** (ele não pede autorização). Sem a migration aplicada, o código novo funciona igual (falha-aberta).

## Anexo E — Limpeza de arquivos sem uso: o que o dono precisa fazer (só depois da migration `...22` e do código no ar)
A migration `20261130000022` nasce com a exclusão **DESLIGADA**: a rotina só procura e marca (quarentena de 7 dias). Nada é apagado até alguém ligar no painel.
1. **Variável na Vercel:** crie `CRON_SECRET` (qualquer texto aleatório de 16+ caracteres) em Settings → Environment Variables (Production). Sem ela a rotina agendada responde 503 e não faz nada (de propósito: falha fechada). O `vercel.json` já agenda a chamada diária (06:20 UTC).
2. Deixe rodar uns dias **desligada**. Em Admin → Uploads → "Limpeza de arquivos sem uso" confira a lista de candidatos: o que estiver ali e não deveria apagar, toque em **Manter**.
3. Só então toque em **Ligar a exclusão** (pede confirmação). Voltar atrás é "Voltar a só simular" (vale na hora). Se aparecer arquivo demais de uma vez, a rotina para sozinha (disjuntor) e mostra o motivo nas últimas rodadas.

## Anexo F2 — R2 PRIVADO do digital (conteúdo vendido): o que o dono precisa fazer na Cloudflare
O código está pronto e desligado. Para ligar (nada disto foi feito em conta real):
1. **Cloudflare → R2 → Create bucket** (classe Standard), nome sugerido **`iuser-digital`**. **PRIVADO: não ligue Custom Domain nem o endereço `r2.dev`** (se ligar, o conteúdo pago fica aberto). Não use o `iuser-media` para isso.
2. **CORS do bucket** (Settings → CORS policy): origens `https://www.iuser.com.br` e `https://iuser.com.br` (e as de preview/staging que for testar), métodos `PUT`, `GET`, `HEAD`, cabeçalho permitido `Content-Type`, `ExposeHeaders` vazio.
3. **Token**: o token de hoje está restrito ao `iuser-media`. Ou edite-o para cobrir os DOIS buckets (Object Read & Write), ou crie um token só para o `iuser-digital` e use as variáveis `R2_DIGITAL_ACCESS_KEY_ID`/`R2_DIGITAL_SECRET_ACCESS_KEY`.
4. **Vercel (Production):** `R2_DIGITAL_BUCKET=iuser-digital` (e as duas chaves do passo 3, se criou um token novo). Publique de novo para valer.
5. Depois de publicar (migration `...33` ANTES do código): Admin → Uploads → cartão **Cloudflare R2 privado** → **Testar o R2 privado** (4 passos verdes). Só então ligue o tipo **Digital pesado (R2 privado)** (Editar limites → Tipo ligado) e ajuste os limites. Antes disso o digital segue pelo Supabase como hoje.
6. Alerta de gasto na Cloudflare (o plano grátis do R2 tem 10 GB no total, somando os dois buckets).

## Anexo F — R2 (vídeo e música): o que já está feito e o que falta
**Já feito (03/11/2026):** R2 ativado; bucket privado `iuser-media`; token da conta restrito a esse bucket (Object Read & Write); variáveis `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` na Vercel (Production); CORS do bucket para `https://www.iuser.com.br` e `https://iuser.com.br`.
**Depois de publicar (migration `...23` antes do código):**
1. Admin → Uploads → cartão **Cloudflare R2** → **Testar o R2**. Deve mostrar 4 passos verdes (gravar, conferir o tamanho, ler, apagar). Erro 403 = chave errada ou sem permissão neste bucket.
2. Só com o teste verde, ligue o tipo **Vídeo e música (R2)** (Editar limites → Tipo ligado) e ajuste os limites.
3. **Domínio de mídia: JÁ LIGADO (03/11/2026)** em `https://midia.iuser.com.br` (Cloudflare → R2 → iuser-media → Custom Domains; TLS mínimo 1.2). As variáveis `R2_PUBLIC_BASE` e `NEXT_PUBLIC_R2_PUBLIC_BASE` (as duas `https://midia.iuser.com.br`, Production, tipo Config) **já foram criadas na Vercel** em 03/11/2026; valem a partir do próximo deploy (a publicação da `staging` em `main` já serve). Atenção: o domínio torna TODO o conteúdo do bucket público; não guarde nada privado ou pago em `iuser-media`.
4. Configure um alerta de gasto na Cloudflare (Billing → Budget alert).
5. Se for testar em staging/preview, acrescente o endereço dele no CORS do bucket.
O primeiro uso é o **vídeo do Flash** (migration `...24`): com o tipo ligado, o vídeo vai ao R2 e o limite sobe de 15 MB para 200 MB; desligado, tudo segue como hoje.
6. Para o vídeo sair da CDN da Cloudflare (recomendado), ligue o domínio de mídia e crie **também** `NEXT_PUBLIC_R2_PUBLIC_BASE` com o mesmo endereço (esta vai para o navegador; publique de novo). Sem ela o vídeo abre por link assinado, o que funciona, mas gasta uma chamada de servidor por reprodução.
