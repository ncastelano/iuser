# Controle de uploads e de mídia — mapa de hoje e plano

Levantado em **2026-11-02** a partir do código, do banco local (que espelha o esquema) e do painel de uso do Supabase. Objetivo: **saber exatamente o que entra no Storage, quem pode enviar, quanto, e impedir que alguém derrube o servidor ou estoure a cota** — hoje e quando entrarem música, vídeo, rede social completa e live.

## 1. Como o upload funciona hoje

- **~39 pontos do app** enviam arquivo **direto do navegador para o Storage do Supabase** (`supabase.storage.from(bucket).upload(...)`). O servidor do iUser não participa: não vê, não conta e não recusa nada.
- **Um único ponto central** envolve todos eles: `src/lib/supabase/client.ts` (reduz a foto antes de enviar, via `lib/optimizeImage.ts`, e põe cache longo). É o lugar natural para um controle, mas **roda no navegador**, então quem chamar a API do Storage com o próprio login passa por fora.
- Quem pode enviar é decidido pelas **políticas do Storage** (migration `20261106_storage_lockdown`): só gente logada, e em 7 buckets só na pasta da própria pessoa. **Tamanho, tipo e quantidade não entram nessas políticas.**
- **Lição do que já aconteceu:** o próprio `optimizeImage.ts` registra que a cota estourou em outubro porque fotos de 3 a 5 MB eram usadas como avatar de 40 px. Controlar o tamanho que entra e o que sai é o que mantém o custo sob controle.

## 2. Mapa dos buckets

| Bucket | Acesso | Limite no servidor | Quem envia (pontos no código) | Checagem hoje |
|---|---|---|---|---|
| `avatars` | público | **nenhum** | fotos de perfil, cadastro, loja, entregas (11) | só otimização no navegador (800 px) |
| `product-images` | público | **nenhum** | produtos, serviços, publicações, imóveis, combos (11) | 5 MB em alguns formulários |
| `store-logos` | público | **nenhum** | logo da loja (4) | 5 MB em um deles |
| `community-photos` | público | **nenhum** | comunidades (3) | 6 MB no navegador |
| `service-request-photos` | público | **nenhum** | pedido de serviço (2) | — |
| `driver-car-photos` | público | **nenhum** | cadastro do veículo (2) | — |
| `driver-selfie-photos` | público | **nenhum** | cadastro do motorista (1) | — |
| `ride-object-photos` | público | **nenhum** | objeto da corrida (1) | — |
| `backgrounds` | público | **nenhum** | fundo do perfil (1) | — |
| `mural-images`, `posts`, `store-links` | público | **nenhum** | (sem ponto de upload encontrado) | — |
| `flash-media` | público | **15 MB**; imagem e vídeo (jpeg/png/webp/gif, mp4/webm/mov) | Flash (1) | 15 MB no navegador |
| `delivery-proofs` | público | **8 MB**; jpeg/png/webp | prova de entrega (1) | — |
| `digital-files` | **privado** | **500 MB**; qualquer tipo | cursos e arquivos digitais (1) | 500 MB no navegador |

> Atenção ao `digital-files`: segundo a documentação do Supabase, o plano **Free** tem teto global de **50 MB por arquivo**; o limite de 500 MB do bucket só vale em plano pago. Confira em Storage → Settings.

## 3. O que está solto (riscos reais)

1. **12 de 15 buckets não têm limite de tamanho nem de tipo no servidor.** Quem estiver logado pode enviar arquivos enormes ou de qualquer tipo (inclusive HTML/SVG, que ficam servidos no endereço do Supabase).
2. **A checagem de tamanho existe só no navegador** (~7 pontos) e é contornável com uma chamada direta à API do Storage.
3. **A otimização de foto é só no navegador**: quem pular o app envia o original.
4. **Não existe contagem de uso por pessoa nem cota**, e nada limita **quantos** uploads por hora/dia. (O Flash limita 20 posts por hora, mas conta *linhas*; o arquivo já foi enviado antes.)
5. **Cadastro aberto + upload de avatar:** contas descartáveis podem encher o Storage. Não há limite por IP/dispositivo nesse caminho.
6. **Arquivo órfão:** se a pessoa envia a foto e não salva o formulário, o arquivo fica para sempre.
7. **Nenhuma tela do Admin mostra o Storage por bucket ou por pessoa** (só o total aproximado em Financeiro).

## 4. O plano, em camadas (da mais barata para a mais completa)

**Camada 1 — Limites no servidor, por bucket** *(uma migration, pouco esforço, protege já)*
Definir `file_size_limit` e `allowed_mime_types` nos 12 buckets soltos (ex.: fotos até 5 MB em jpeg/png/webp; avatar 2 MB; vídeo curto 50 MB). É imposto pelo próprio Storage, não dá para burlar. Cuidado a testar: formatos como HEIC/AVIF do iPhone, e arquivos que o navegador deixa de otimizar.

**Camada 2 — Um catálogo único de tipos de upload** *(a ideia central do "mapear tudinho")*
Cada tipo de envio vira uma linha numa tabela editável no Admin (como as Tarifas): `kind` (avatar, produto, flash-foto, flash-vídeo, música, live-capa…), bucket, tamanho máximo, tipos permitidos, quem pode (visitante/cliente/loja/motorista/admin e plano), cota e se precisa de moderação. Os ~39 pontos do app passam a chamar **uma só função**, `uploadFile(kind, arquivo)`, em vez de falar com o Storage cada um do seu jeito.

**Camada 3 — Upload autorizado pelo servidor** *(fecha o "pular o app")*
O app pede a `/api/uploads/sign`; o servidor confere login, plano, cota e ritmo e só então entrega uma URL de envio de uso único (`createSignedUploadUrl`). A política de INSERT direto dos clientes nos buckets controlados é removida. O tamanho exato é imposto pelo limite do bucket (Camada 1).

**Camada 4 — Contabilidade e cotas**
Tabela de uso por pessoa e bucket (bytes e nº de arquivos), alimentada ao confirmar o upload. Cota por plano, limite por hora e por dia, e um **interruptor para bloquear uploads de uma pessoa** ou de um tipo inteiro.

**Camada 5 — Painel Admin → Uploads**
Uso por bucket e por pessoa, maiores consumidores, edição dos limites do catálogo, bloqueio de pessoa/tipo e alerta quando a cota do Supabase passar de 80%.

**Camada 6 — Limpeza e custo**
Rotina que apaga órfãos e a foto antiga quando a pessoa troca a imagem; manter o proxy de imagens (`/img`, cache da Vercel) e miniaturas para listas.

## 4b. Andamento

- **Camada 1 — FEITA no banco local (02/11/2026), ainda não publicada.** Migration `20261130000018_storage_bucket_limits.sql` (rollback `storage_bucket_limits_rollback.sql`): os 12 buckets de foto passam a ter limite de **5 MB** (`community-photos` 6 MB) e só aceitam **JPEG, PNG, WebP, GIF e AVIF**. SVG, HEIC e qualquer outro tipo são recusados pelo próprio Storage. Testado contra a API local: 300 KB passa; 5,4 MB em `product-images` e 6,5 MB em `community-photos` voltam "exceeded the maximum allowed size"; SVG e HEIC voltam "mime type … is not supported"; `flash-media` e os outros dois buckets com regra própria não foram mexidos.
- **Espelho no navegador:** `src/lib/uploadLimits.ts` (mesma tabela) é usado pelo ponto central de upload (`lib/supabase/client.ts`) para avisar em português antes de enviar e dar o tipo certo a arquivo sem tipo. `npm run test:upload-limits` falha se a tabela e a migration divergirem.
- **Limite do plano Free:** o teto global do plano é 50 MB por arquivo, então o `digital-files` (500 MB) só vale de verdade em plano pago. Não mexido.
- **Camada 2 (catálogo + registro) — FEITA no banco local (02/11/2026), ainda não publicada.** Migration `20261130000019_upload_catalog.sql` (rollback `upload_catalog_rollback.sql`, cenários `supabase/tests/upload_catalog_scenarios.sql`, testes `npm run test:upload-catalog`): `upload_kinds` (15 tipos, um por bucket, com `provider` = `supabase | r2 | stream`, tamanho máximo e tipos aceitos; um cenário de banco confere que o catálogo e `storage.buckets` batem) e `media_assets` (registro de cada arquivo: dono, tipo, provedor, chave, bytes, MIME). O ponto central de envio (`lib/supabase/client.ts`) chama `register_media_asset` depois de cada upload bem-sucedido, **sem esperar e sem nunca bloquear o envio**; o servidor lê bytes e MIME do próprio Storage e só o dono do arquivo registra. Os 618 arquivos que já existiam no banco local entraram no registro (donos desconhecidos ficam com `owner_id` nulo). `my_media_usage()` devolve o uso da própria pessoa; `media_assets_reconcile()` (só serviço) marca como apagado o que sumiu do Storage. Regras puras e a validação que o Admin vai usar: `src/modules/uploads`. **O Storage proíbe `DELETE` direto em `storage.objects`** (só pela API), então não dá para limpar o registro por gatilho: a limpeza é por rotina.
- **Camadas 3 e 4 (autorização, ritmo, cotas e bloqueios) — FEITAS no banco local (02/11/2026), ainda não publicadas.** Migration `20261130000020_upload_authorization.sql` (rollback `upload_authorization_rollback.sql`, cenários `supabase/tests/upload_authorization_scenarios.sql` (11), testes `npm run test:upload-authorization`, ponta a ponta `scripts/local/test-upload-authorization.mjs`).
  - **Decisão que muda o plano original: não há rota `/api/uploads/sign`.** O plano previa o servidor entregando um link de envio assinado, mas um link criado com a chave de serviço grava o arquivo **sem dono** (`owner` nulo), e as políticas de trocar, apagar e ler dependem do dono. Em vez disso a autorização é uma função do BANCO (`authorize_upload`, chamada como a própria pessoa) que grava uma **autorização curta** (`upload_grants`, 15 min; 60 min no Flash; 3 h nos digitais) para o caminho exato, e as 5 políticas de INSERT do Storage passam a aceitar "envio direto permitido **OU** autorização válida". O arquivo continua sendo enviado pela própria pessoa (dono certo), sem rota nova e sem chave de serviço no meio.
  - **O que a função confere, nesta ordem:** login, tipo ligado e no Supabase, conta bloqueada, bloqueios (pessoa, tipo ou pessoa+tipo, com prazo), tipo de arquivo, arquivo vazio, tamanho, caminho válido, pasta própria (tipos com `owner_folder`), trocar só arquivo próprio (`upsert`), plano ativo (se o tipo exigir), **ritmo** (arquivos por hora), **cota do dia** (bytes em 24 h, usando o tamanho REAL quando o arquivo já foi registrado) e **cota total** (o que a pessoa já tem + autorizações pendentes; trocar o mesmo caminho não conta em dobro). Serializa por pessoa e tipo (`pg_advisory_xact_lock`) para dois envios simultâneos não passarem juntos pelo limite.
  - **Interruptor `upload_settings.signed_required` (padrão DESLIGADO):** desligado, o envio direto continua aceito como hoje (nada quebra para o código antigo); ligado (`admin_upload_set_enforced(true)`), sem autorização não há envio. **Ordem de publicação: migration → código novo no ar → só então ligar o interruptor.** Ligar antes derruba os envios do código antigo.
  - **No navegador** (`lib/uploadAuthorization.ts`, encaixado em `lib/supabase/client.ts` depois da checagem de formato e antes de enviar): pede a autorização e mostra o motivo em português; **se o banco não responde (rede, migration ainda não aplicada, sem login), segue direto** e a política do Storage decide. Registrar o arquivo (`register_media_asset`) fecha a autorização: guarda o tamanho real e a marca como usada.
  - **Valores iniciais (propostas, editáveis):** fotos de perfil/fundo/logo 20–30 arquivos por hora, 50 MB por dia e 200 MB no total; fotos de produto 200 por hora, 400 MB por dia e 3 GB; Flash 30 por hora, 300 MB por dia e 2 GB; provas de entrega 120 por hora; digitais 20 por hora, 2 GB por dia e 20 GB. Nenhum tipo exige plano hoje (`requires_plan`): é decisão do dono.
  - **Administração (só serviço, grava `admin_config_audit`):** `admin_upload_set_enforced`, `admin_upload_block` / `admin_upload_unblock` (pessoa, tipo ou os dois; com prazo ou sem), `admin_upload_update_kind` (limites, `enabled`, `requires_plan` e `max_bytes`, que também atualiza o limite do bucket). Ainda sem tela: a tela é a Camada 5. Rotina diária `upload-grants-purge` apaga autorizações com mais de 8 dias.
  - **Limite conhecido:** o tamanho que o app informa ao pedir autorização pode ser menor que o real; quem fecha isso é o limite do bucket (cada arquivo, no máximo o tamanho do tipo) e o ritmo por hora, e o registro corrige a cota com o tamanho real. Quem não registra o arquivo deixa a autorização reutilizável até vencer (15 min a 3 h).
  - **Verificado:** 11 cenários de banco; 30 verificações na API real do Supabase local (login de verdade, envio de arquivo de verdade: dono certo, interruptor ligado e desligado, 12 pedidos simultâneos com limite 1 = passa 1, bloqueio, ritmo); e o **ponto central de envio exercitado no navegador** (`window.__supabase` em desenvolvimento): foto válida autoriza+envia+registra (autorização fechada com o tamanho real), 6 MB e SVG recusados no navegador sem tocar no banco, ritmo (429 "tente de novo em 1 hora"), bloqueio (403 com o motivo), interruptor ligado com app normal (passa) e com a autorização indisponível (a política do Storage recusa). **Não verificado:** o staging (bloqueado pela cota 402) e as telas reais de envio (o painel do navegador não escolhe arquivo).
  - **Diferença do banco LOCAL:** o baseline local ainda traz políticas antigas do Storage (inclusive do tipo `ALL` para o papel `public`, que inserem até sem login) que a produção já perdeu no bloqueio `20261106`. Por isso os testes de política descartam essas antigas dentro da transação, e o teste ponta a ponta as remove do banco local (descartável) antes de ligar o interruptor.
- **Camada 5 (painel Admin → Uploads) — FEITA no banco local (02/11/2026), ainda não publicada.** Migration `20261130000021_upload_admin.sql` (rollback `upload_admin_rollback.sql`, cenários `supabase/tests/upload_admin_scenarios.sql` (7), testes `npm run test:upload-admin` (12)), tela `UploadsSection`, rota `/api/admin/uploads`. O que mostra e faz: totais; uso por tipo com os limites e a atividade das últimas 24 h; **edição de limites** (revisão antes→depois, validação igual no navegador e no servidor, `max_bytes` também atualiza o bucket); **maiores consumidores** (todos ou por tipo); **quem foi barrado** (recusas agrupadas por pessoa+tipo+motivo em janelas de 10 min, com contador); **bloqueio e liberação** (pessoa e/ou tipo, com prazo e motivo); **interruptor** com confirmação; **histórico** com o @ de quem foi bloqueado; **alerta da cota do Supabase** (≥ 80%). `authorize_upload` virou um embrulho sobre `_authorize_upload_core` que anota as recusas sem nunca mudar a resposta. Verificado na tela real do navegador local, passo a passo, conferindo o banco depois de cada ação (inclusive que o bloqueado é recusado só no tipo bloqueado). **Não verificado:** com volume de produção (milhares de pessoas: `admin_upload_top_owners` agrega `media_assets`, que tem índice por dono e tipo, mas não foi medido), e a tela em celular pequeno (foi vista no painel do navegador, que é estreito).
- **Camada 6 (limpeza de arquivos sem uso) — FEITA no banco local (02/11/2026), ainda não publicada.** Migration `20261130000022_upload_cleanup.sql` (rollback `upload_cleanup_rollback.sql`, cenários `supabase/tests/upload_cleanup_scenarios.sql` (10), testes `npm run test:upload-cleanup` (16), ponta a ponta `node scripts/local/test-upload-cleanup.mjs` (33 verificações, só local)), rotina `src/lib/uploadCleanup.ts`, rota `/api/internal/uploads-cleanup`, `vercel.json`, cartão no painel Admin → Uploads.
  - **Princípio:** apagar é irreversível, então cada passo erra para o lado de NÃO apagar. Só tipos elegíveis (nunca prova de entrega, arquivo digital pago nem foto de corrida); só foto/vídeo com nome seguro, registrado e com mais de 3 dias; "órfão" = o **nome** do arquivo não aparece em nenhuma coluna de texto, JSON ou lista de texto do banco (todas as tabelas de `public` e os metadados da conta), em vez de uma lista manual de colunas (esquecer uma apagaria foto em uso); **quarentena** de 7 dias só marcando, com nova conferência na hora de apagar (se alguém volta a citar o arquivo, a marca sai sozinha); **disjuntor** (mais de 20 e mais de 30% dos elegíveis apagáveis de uma vez = aborta); nasce **desligada** (só simula); limite por rodada.
  - **Quem apaga:** o servidor, pela API do Storage (o Storage proíbe `DELETE` direto em `storage.objects`), em lotes de 100 por bucket; o banco só confirma o que realmente sumiu, e erro do Storage nunca vira "apagado". Antes de cada exclusão o nome é conferido de novo.
  - **Agendamento:** Vercel Cron diário (`vercel.json`) chama a rota com `CRON_SECRET` (falha fechada); `pg_cron` roda `media_assets_reconcile()` todo dia às 03:40 (arquivo que sumiu do Storage por fora do registro vira `deleted` com motivo `missing`). **Do dono:** criar `CRON_SECRET` (16+ caracteres) nas variáveis da Vercel; sem ela só o botão do painel e o `pg_cron` funcionam.
  - **Painel:** simular, apagar agora (com confirmação), ligar/desligar a exclusão de verdade (com confirmação), prazos e limite por rodada, candidatos com **Manter** e as últimas rodadas. Tudo auditado em `admin_config_audit`.
  - **Verificado:** 10 cenários de banco; 33 verificações com Storage real (arquivo sem uso some de verdade, citado/mantido/prova de entrega ficam, quem volta a ser citado sai da quarentena, falha do Storage não vira apagado, arquivo que sumiu por fora vira `missing`); busca em **583 arquivos reais** do banco local = 0 órfãos; painel no navegador (simular, manter, prazo inválido, ligar, apagar, últimas rodadas); rota agendada 503/401 e rota do painel 403 sem login. **Não verificado:** o Cron da Vercel de verdade (só existe publicado) e o staging (cota 402).
  - **Fica de fora:** arquivos no R2/Stream (a rotina só cuida do provedor `supabase`; quando o R2 entrar, o `remove` do provedor entra aqui); miniaturas; apagar a foto ANTIGA no mesmo instante em que a pessoa troca (hoje ela vira "sem uso" e sai em ~10 dias); o texto do aviso ao dono quando o disjuntor abrir (hoje só aparece na rodada e no histórico do painel).

- **Envio pelo R2 — FEITO no banco local (03/11/2026), ainda não publicado.** R2 ativado na Cloudflare (bucket privado `iuser-media`, classe Standard, CORS só do site) e as quatro variáveis na Vercel (Production). Migration `20261130000023_upload_r2.sql` (rollback `upload_r2_rollback.sql`, cenários `supabase/tests/upload_r2_scenarios.sql` (9), testes `npm run test:upload-r2` (14), ponta a ponta `node scripts/local/test-r2-flow.mjs` (46)), código `src/lib/r2.ts` (servidor), `src/lib/r2Upload.ts` (navegador), rotas `/api/uploads/r2/sign` e `/complete`, botão "Testar o R2" em Admin → Uploads.
  - **Por que o R2 tem rota de assinatura e o Supabase não:** no Supabase o arquivo tem dono no Storage e as políticas decidem; no R2 não existe dono, então o servidor é o porteiro e o dono fica no registro (`media_assets`). O arquivo continua indo direto do navegador ao R2 (não passa pelo servidor).
  - **Camadas:** (1) o banco decide (`authorize_upload` como a pessoa: login, bloqueios, tipo, tamanho, ritmo, cotas, plano); (2) o link PUT assinado vale 15 min, é de um caminho que o servidor escolheu e leva tipo e tamanho assinados; (3) na confirmação o servidor lê o que o R2 guardou e apaga o que passar do combinado; (4) registro só com autorização aberta do mesmo caminho e pessoa.
  - **Tipo `media_r2` nasce desligado** (vídeo e áudio até 200 MB, 10 por hora, 1 GB por dia, 2 GB por pessoa; propostas). O plano grátis do R2 inclui 10 GB, 1 milhão de gravações e 10 milhões de leituras por mês, sem cobrança de saída.
  - **Verificado:** assinatura igual aos exemplos oficiais da AWS (link e cabeçalhos); 46 verificações com o app e o banco locais e um R2 de mentira que confere cada assinatura (envio com 1 byte a mais, outro tipo e outro caminho são recusados; R2 permissivo é pego na confirmação e o objeto é apagado; uma pessoa não confirma o arquivo da outra; desligado, bloqueio e ritmo valem); painel no navegador (cartão e erro do teste). **Não verificado:** conversa com o R2 REAL (as chaves ficam só na Vercel) — por isso o botão "Testar o R2", que roda no servidor depois da publicação; e o envio de um arquivo grande de verdade pelo navegador.
  - **Fica de fora:** nenhuma tela do app usa o R2 ainda (primeiro cliente natural: vídeo do Flash); domínio de mídia `midia.iuser.com.br` (R2_PUBLIC_BASE); migrar as fotos antigas; apagar do R2 na limpeza; Stream.

- **Flash com vídeo no R2 — FEITO no banco local (03/11/2026), ainda não publicado.** Migration `20261130000024_flash_r2.sql` (rollback `flash_r2_rollback.sql`, cenários `supabase/tests/flash_r2_scenarios.sql` (5)), `modules/flash` (`isR2Key`, `r2FallbackAllowed`, limite do vídeo), rotas `/api/media/r2` e `/api/uploads/r2/remove`, tela de postar do Flash (limite maior e progresso). Ponta a ponta: seção 8 de `scripts/local/test-r2-flow.mjs` (64 verificações no total).
  - **Decisão: sem coluna nova.** O flash guarda a chave do R2 em `media_url` e o app a reconhece pelo formato do nome (`<uuid>/<uuid>.mp4`); o Supabase nunca usa uuid no nome do arquivo. Menos peças (nada muda em `get_flash_feed`), com a trava no banco: o gatilho `flashes_r2_guard` só deixa entrar um flash com esse tipo de nome se o arquivo foi registrado pela mesma pessoa e ninguém mais o usa.
  - **Fallback para o Supabase** só quando o R2 não está pronto ou caiu e o vídeo cabe em 15 MB. Recusa de regra (bloqueio, ritmo, cota) mostra o motivo e não cai no Supabase.
  - **Reprodução:** com o domínio de mídia (`NEXT_PUBLIC_R2_PUBLIC_BASE`) o vídeo sai da CDN da Cloudflare; sem ele, pela rota que redireciona para um link assinado de 1 h (só de flash visível). **Apagar o flash apaga o vídeo no R2.**
  - **Não verificado:** envio real de um vídeo grande pelo celular até o R2 verdadeiro (as chaves ficam na Vercel) e a reprodução pelo domínio de mídia.

- **Limpeza no R2 — FEITA no banco local (03/11/2026), ainda não publicada.** Migration `20261130000026_r2_cleanup.sql` (rollback `r2_cleanup_rollback.sql`, cenários `supabase/tests/r2_cleanup_scenarios.sql` (4), testes `npm run test:upload-cleanup` (22), ponta a ponta na seção 9 de `scripts/local/test-r2-flow.mjs`), `lib/r2Cleanup.ts`, `r2ListAll` em `lib/r2.ts`.
  - **Dois casos:** vídeo registrado que nenhum flash usa (mesma quarentena de 7 dias, nova conferência, apagado pela API do R2 e **conferido** com HEAD antes de confirmar) e objeto **solto** no bucket (listado pelo servidor; só o nome exato `<uuid>/<uuid>.<mp4|webm|mov>`, mais velho que a idade mínima e desconhecido do banco).
  - **Travas extras do R2:** disjuntor (mais de 20 candidatos e mais da metade soltos de uma vez aborta), nunca toca em áudio, `_healthcheck/` nem arquivo subido à mão, limite por rodada, e tudo só com a limpeza LIGADA no painel.
  - **Por que só vídeo:** a busca de referências só conhece as extensões de foto e vídeo; um áudio em uso pareceria sem uso. Quando existir uso real de áudio, a busca aprende as extensões antes de o áudio entrar.
  - **Não verificado:** a limpeza contra o R2 REAL (listagem de verdade, paginação acima de 1000 objetos). O teste de ponta a ponta usa um R2 de mentira que confere as assinaturas.

## 5. Música, vídeo, rede social e live: o Storage do Supabase não é o lugar

Mesmo com controle perfeito, **o custo de tráfego é o problema**, não só o espaço. Conta simples: uma música de 4 MB tocada 1.000 vezes são 4 GB — quase toda a cota gratuita de um mês inteiro. Um vídeo curto de 15 MB multiplica isso.

- **Música e vídeo:** guardar em um serviço de mídia com tráfego barato ou incluído (por exemplo Cloudflare R2 / Stream, Bunny, Mux), com URL assinada e CDN. O Supabase continua com os **metadados e as permissões** (quem postou, quem pode ouvir, denúncias), que é onde o iUser já é forte.
- **Live:** sempre um serviço próprio de transmissão (por exemplo LiveKit, Agora, Cloudflare Stream, Mux). Cobra por minuto de transmissão e por espectador, então precisa de **limites por plano** desde o começo.
- **Música de terceiros tem direito autoral.** Subir música de outras pessoas exige termos de uso, denúncia, derrubada rápida e, dependendo do caso, licença (ECAD/gravadoras). Definir cedo se o iUser aceita só músicas do próprio autor ou licenciadas. *(Isto não é aconselhamento jurídico: vale consultar um advogado.)*
- **Rede social com mídia** pede moderação mais forte do que a atual (denúncias e ocultação já existem para Flash, comentários e avaliações): conteúdo ilegal, menores, spam. Vale prever a verificação automática do provedor de mídia.

## 5b. Decisão (02/11/2026): preparar a Cloudflare desde já, com provedor por tipo de upload

Motivo: o custo do tráfego no Supabase cresce junto com o sucesso (ver as contas na conversa: 1 milhão de músicas/mês ≈ US$ 112–337 só de saída) e **mover depois é mais caro do que nascer certo**, porque os arquivos e os endereços já estão gravados nas tabelas. No R2 a saída é grátis. O Supabase continua com banco, login, realtime e permissões.

**Desenho:**
- Catálogo de uploads (Camada 2) ganha o campo **`provider`** (`supabase` | `r2` | `stream`) por tipo. Mudar o destino de um tipo vira configuração, não reescrita.
- Tabela **`media_assets`** (dono, tipo, provedor, chave do arquivo, bytes, tipo MIME, estado) como registro de TUDO que entra: base das cotas, do painel e da limpeza de órfãos. As tabelas de conteúdo (flash, publicação…) passam a apontar para o `asset`, não para um caminho do Storage.
- O servidor gera a **URL de envio assinada** (S3 presign) depois de conferir login, plano, cota e tamanho (Camada 3).
- Atenção ao banco: hoje `flashes.media_url` só aceita **caminho na pasta da própria pessoa** (nunca link externo). Ao usar R2 isso precisa ser adaptado por migration (nova coluna de provedor/ativo), mantendo a regra de que a pessoa só referencia arquivo que ela mesma enviou.
- **Arquivos que já existem ficam onde estão**; só os envios novos de um tipo trocado vão ao R2. A leitura aceita os dois provedores.

**Primeiros tipos no R2 (novos envios):** vídeo do Flash e, quando existir, música. Live em serviço de transmissão (Stream ou similar). Fotos de produto e publicação continuam no Supabase com o proxy `/img`, até valer a pena trocar.

**Domínio (decidido e feito em 02/11/2026):** o `iuser.com.br` é registrado pela **Hostinger** (provedor `HSTDOMAINS` no Registro.br, vence em 30/08/2027) e o DNS estava na Vercel. O R2 só serve mídia por domínio próprio se o domínio for uma "zona" na Cloudflare, e a configuração por CNAME (parcial) só existe nos planos pagos Business/Enterprise. Em vez de comprar um domínio só para mídia, **o DNS do `iuser.com.br` foi movido para a Cloudflare (plano grátis)** e o site continua na Vercel (CNAME `@`, `www` e `*` para a Vercel, só DNS, sem proxy). Isso deixa o subdomínio `midia.iuser.com.br` de graça quando o R2 for ligado. Detalhes, como voltar atrás e o que fazer se a Vercel mudar o destino: `docs/PUBLICACAO.md` (Anexo C). O endereço `r2.dev` fica só para testes (tem limite de requisições, não tem cache e a Cloudflare o chama de "só desenvolvimento").

**O que só você pode fazer (já feito: conta Cloudflare, zona e troca do DNS; falta:)** cadastrar o pagamento para ativar o R2 e gerar a chave de API do R2 (que vai para as variáveis da Vercel, nunca para o repositório). Regra do projeto: registrar o serviço em Admin → Financeiro (`service_expenses`, por migration).

## 6. Decisões que preciso de você

1. **O que vai ter:** música (só do próprio autor, ou de terceiros?), vídeo curto, live, áudio de voz, stories? Isso define o que entra no catálogo e o custo.
2. **Quem pode postar o quê:** visitante, cliente, loja, motorista, só quem tem plano? Cada plano com sua cota?
3. **Fornecedor de mídia externo:** aceita contratar um (custo à parte do Supabase)? É o que permite música e live sem estourar a cota.
4. **Limites iniciais:** eu proponho valores padrão por tipo e plano, e você ajusta no Admin depois — ou prefere definir antes?
5. **Por onde começar:** recomendo **Camada 1 agora** (barata e protege na hora) e depois as Camadas 2 e 3 num tipo piloto (por exemplo `flash-media` ou `product-images`).

## 7. Cuidados de execução
- Mexer em limite de bucket pode **bloquear envios que hoje funcionam** (ex.: HEIC): testar no local e no staging antes. O staging está bloqueado por cota até 13/11 (ver `docs/PUBLICACAO.md`).
- Toda mudança de bucket/política vai por **migration** (fluxo aprovado), nunca à mão no painel.
- Bucket novo: política de INSERT na mesma migration e inclusão em `BUCKETS` do proxy `/img` se for imagem pública (regra já existente no `CLAUDE.md`).
