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

## 5. Música, vídeo, rede social e live: o Storage do Supabase não é o lugar

Mesmo com controle perfeito, **o custo de tráfego é o problema**, não só o espaço. Conta simples: uma música de 4 MB tocada 1.000 vezes são 4 GB — quase toda a cota gratuita de um mês inteiro. Um vídeo curto de 15 MB multiplica isso.

- **Música e vídeo:** guardar em um serviço de mídia com tráfego barato ou incluído (por exemplo Cloudflare R2 / Stream, Bunny, Mux), com URL assinada e CDN. O Supabase continua com os **metadados e as permissões** (quem postou, quem pode ouvir, denúncias), que é onde o iUser já é forte.
- **Live:** sempre um serviço próprio de transmissão (por exemplo LiveKit, Agora, Cloudflare Stream, Mux). Cobra por minuto de transmissão e por espectador, então precisa de **limites por plano** desde o começo.
- **Música de terceiros tem direito autoral.** Subir música de outras pessoas exige termos de uso, denúncia, derrubada rápida e, dependendo do caso, licença (ECAD/gravadoras). Definir cedo se o iUser aceita só músicas do próprio autor ou licenciadas. *(Isto não é aconselhamento jurídico: vale consultar um advogado.)*
- **Rede social com mídia** pede moderação mais forte do que a atual (denúncias e ocultação já existem para Flash, comentários e avaliações): conteúdo ilegal, menores, spam. Vale prever a verificação automática do provedor de mídia.

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
