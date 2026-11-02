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
- **Camadas 2 a 6:** a fazer (catálogo de tipos com `provider`, tabela `media_assets`, upload autorizado pelo servidor, cotas, painel, limpeza).

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

**Pré-requisito de domínio:** o DNS de `iuser.com.br` está na **Vercel** (`ns1/ns2.vercel-dns.com`). Para o R2 servir mídia por domínio próprio com cache, o domínio precisa estar como "zona" na Cloudflare. Opções: (a) um **domínio separado só para mídia** (ex.: `iusermidia.com`) na Cloudflare — isolado, sem mexer no DNS de produção, **recomendada**; (b) mover o DNS inteiro do `iuser.com.br` para a Cloudflare e recriar os registros da Vercel — mexe no site em produção; (c) o endereço `r2.dev`, que é só para teste (limitado e sem cache). Confirmar na documentação da Cloudflare antes de contratar.

**O que só você pode fazer:** criar a conta Cloudflare e cadastrar o pagamento, escolher/registrar o domínio de mídia e gerar a chave de API do R2 (que vai para as variáveis da Vercel, nunca para o repositório). Regra do projeto: registrar o serviço em Admin → Financeiro (`service_expenses`, por migration).

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
