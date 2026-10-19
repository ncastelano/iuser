# Ambiente de teste (staging) e entrega segura

Objetivo: **nada chega à produção sem antes ser visto e testado num ambiente separado, e tudo pode ser desfeito.**

```
 sua branch ──► staging (app de teste + banco de teste) ──► main (produção: app + banco de verdade)
                 dados FICTÍCIOS, pode quebrar                       só depois de aprovado
```

São **duas camadas separadas**, e as duas precisam existir:

| Camada | Produção | Teste (staging) |
|---|---|---|
| **App (código)** | branch `main` na Vercel | branch `staging` (e qualquer outra) na Vercel → link de *preview* |
| **Banco (dados + esquema)** | projeto Supabase `iuser` | **outro** projeto Supabase só de teste, com dados fictícios |

O que causou o acidente de 2026-10-18 foi justamente o app de teste e os scripts falarem com o banco de produção.
O que está em vigor para isso não repetir:

- **Build bloqueado:** se um deploy que não é de produção (preview/staging) estiver apontando para o banco de produção, o build falha
  (`next.config.js`). O servidor local também avisa em vermelho.
- **Scripts de staging só escrevem no staging** (`scripts/staging/_common.py` recusa a referência da produção).
- **Produção só muda por aprovação** (workflow *Banco de produção* exige um revisor e a palavra `APLICAR`).
- **Faixa laranja "AMBIENTE DE TESTE"** e `noindex` em tudo que for staging.

---

## Estado atual (2026-10-19)

- Banco de staging criado e igual à produção: projeto `iuser-staging` (ref `avxcbdsgsyyjwfsfeexs`).
- Vercel: o projeto `iuser` tem as variáveis de **Preview** apontando para o staging (URL, anon, service_role e `NEXT_PUBLIC_APP_ENV=staging`).
  O projeto `iuser-1` só compila a `main` (Ignored Build Step = "Only build production").
- Branch `staging` criada; o primeiro commit próprio dela dispara o primeiro deploy de teste. (A Vercel pula commits que já foram
  compilados em produção, então a `staging` precisa de um commit novo para gerar o preview.)
- GitHub: `main` protegido (PR + check `checks`), workflows ativos, segredos e ambiente `db-production` com revisor.
- Jobs do `pg_cron` do staging (os mesmos 4 da produção): `supabase/staging/cron-jobs.sql` (aplicar com `python3 scripts/staging/apply-sql.py supabase/staging/cron-jobs.sql`).
- Teste de exposição de dados no staging: `npm run test:security-exposure:staging` (esperado: `RESULT: OK ... fails=0`).
- Pendente: URL dos avisos do banco para o app de teste (a Vercel pede login para abrir o preview; ver "Avisos do banco no staging"), Asaas sandbox.

### Avisos do banco no staging
Os gatilhos de push (`order_push_notificatio...`) e a fila de entrega (`delivery_dispatch_settings.notify_url`) chamam o app por URL.
No staging ficaram com `https://staging.invalid` (não chamam nada). Enquanto o preview exigir login da Vercel (Deployment Protection),
o banco não consegue chamá-lo; então os avisos de push do staging não saem. As telas e as regras do banco funcionam normalmente.

## 1. Criar o projeto Supabase de staging (uma vez)

1. https://supabase.com/dashboard → *New project* na **mesma organização**. Nome: `iuser-staging`. Região: a mesma da produção (West US / Oregon).
   Guarde a senha do banco (gerenciador de senhas; **não** cole em chat nem em arquivo do repositório).
2. Em *Project Settings → General* anote a **Reference ID** (20 letras). Não é segredo.
3. Em *Database → Extensions* confirme/ative: `postgis`, `ltree`, `unaccent`, `pg_trgm`, `pgcrypto`, `uuid-ossp`, `pg_net`, `pg_cron`.
4. Em *Project Settings → API* copie a **URL**, a chave **anon/publishable** e a **service_role/secret** (vão para a Vercel e para `.env.staging.local`).
5. Plano/custo: a conta gratuita tem limite de projetos ativos; um terceiro projeto pode exigir plano Pro. Confira em *Billing*.

## 2. Criar o esquema do staging a partir da produção (uma vez; repetível)

As migrations antigas **não** recriam o banco do zero (as primeiras tabelas nasceram pelo painel). Por isso existe o *baseline*:
`supabase/staging/baseline.sql` = o esquema da produção (sem dados), gerado por `scripts/staging/export-baseline.py`.

```bash
python3 scripts/staging/setup.py --ref <REFERENCE_ID_DO_STAGING>   # aponta .staging/ para o staging (não muda o link da produção)
python3 scripts/staging/export-baseline.py                          # (opcional) regenera o baseline lendo a produção (só leitura)
python3 scripts/staging/apply-baseline.py                           # cria tudo no STAGING e marca as migrations existentes como aplicadas
python3 scripts/staging/export-reference-data.py                    # (opcional) regenera tarifas/planos/níveis...
python3 scripts/staging/apply-sql.py supabase/staging/reference-data.sql
cp .env.staging.example .env.staging.local   # preencha URL, service_role e uma senha de teste
node scripts/staging/seed.mjs                                       # contas e dados fictícios
```

Para recomeçar o staging do zero: `apply-baseline.py --reset` (só apaga o staging).
Para "re-sincronizar" com a produção depois de muito tempo: regenerar o baseline e rodar `--reset`.

## 3. Vercel (app de teste)

Em cada projeto da Vercel que serve o app (hoje `iuser` e `iuser-1`), em *Settings → Environment Variables*:

| Variável | Production (como está) | **Preview** (staging) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL da produção | URL do **staging** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave da produção | chave anon do **staging** |
| `SUPABASE_SERVICE_ROLE_KEY` | da produção | service_role do **staging** |
| `NEXT_PUBLIC_APP_ENV` | (não definir) | `staging` |
| `NEXT_PUBLIC_APP_URL` | URL de produção | URL do preview da branch `staging` |
| `SUPER_ADMIN_EMAIL` | (como está) | `ncastelano@gmail.com` (a conta de teste do admin) |
| `ASAAS_API_KEY`, `ASAAS_API_BASE_URL`, `ASAAS_WEBHOOK_TOKEN` | produção | **sandbox** da Asaas (chaves e URL de sandbox) |
| `SUPABASE_MANAGEMENT_API_TOKEN` | como está | **não definir** (painel de uso fica vazio no teste) |
| `WHATSAPP_*`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `VAPID_*` | produção | **não definir** (ou chaves próprias de teste): sem isso o teste não manda push nem WhatsApp de verdade |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | igual | igual (autorize também o domínio de preview) |

Regra: **nenhuma variável do tipo Preview pode ter valor da produção.** Se tiver, o build é bloqueado.
A branch `staging` ganha um endereço fixo de preview (`iuser-git-staging-...vercel.app`); anote-o e use em `NEXT_PUBLIC_APP_URL`.
Se não precisar do segundo projeto (`iuser-1`) em branches de teste, em *Settings → Git → Ignored Build Step* use: `[ "$VERCEL_GIT_COMMIT_REF" != "main" ]`.

## 4. GitHub (segredos e aprovação)

Os três workflows estão em `.github/workflows/` (`ci.yml`, `db-staging.yml`, `db-production.yml`). Para o `gh` poder criá-los/editá-los ele precisa
do escopo `workflow` (`gh auth refresh -h github.com -s workflow`, já feito neste computador).

*Settings → Secrets and variables → Actions*: `SUPABASE_ACCESS_TOKEN` (token da sua conta), `STAGING_PROJECT_REF`, `STAGING_DB_PASSWORD`.
*Settings → Environments → New environment `db-production`* (não use `production`: é o ambiente da Vercel): marque **Required reviewers** (você) e adicione os segredos
`PRODUCTION_PROJECT_REF`, `PRODUCTION_DB_PASSWORD`, `SUPABASE_ACCESS_TOKEN`, `STAGING_PROJECT_REF`, `STAGING_DB_PASSWORD`.
*Settings → Branches → Branch protection rule para `main`*: exigir pull request e o check **CI** verde.

## 5. A rotina

1. Trabalhe numa branch (ex.: `feature/algo`) e abra um **pull request para `staging`**. O CI confere tipos e testes.
2. Ao entrar em `staging`: o app de teste é publicado e as migrations novas são aplicadas **no banco de staging** (workflow *Banco de staging*).
3. Abra o link de preview e teste com as contas de teste. Quebrou? Só o teste quebrou.
4. Aprovado: **pull request de `staging` para `main`** (o CI roda de novo). Antes de mesclar, aplique as migrations em produção:
   GitHub → Actions → **Banco de produção** → *Run workflow* → digite `APLICAR` → um revisor aprova. O job mostra o que vai rodar,
   confere que já passou pelo staging e só então aplica.
5. Mescle em `main`: a Vercel publica o código. **Ordem:** primeiro o banco (migration só *adiciona*), depois o código que a usa.
   Nunca o contrário, e nunca uma migration que apague/renomeie algo que o código antigo ainda usa (primeiro adiciona o novo, publica,
   e só numa mudança seguinte remove o velho).

## 6. Como voltar atrás (por tipo de problema)

| Problema | Como reverter |
|---|---|
| **Código ruim em produção** | Vercel → *Deployments* → deploy anterior → *Instant Rollback* (segundos, sem banco). Depois `git revert` do commit. |
| **Migration ruim** | cada migration relevante tem `supabase/rollbacks/etapa_X_rollback.sql` (testado dentro de transação). Rode **no staging primeiro**. |
| **Dados estragados** | backup local do que o reparo mexe (ver o reparo de 2026-10-18 em `supabase/repairs/`); backups diários do Supabase; e **PITR** (volta o banco a um minuto exato) — recomendado ativar em *Database → Backups* quando a produção tiver gente de verdade. |
| **Antes de qualquer operação perigosa** | gravar um snapshot das linhas que serão tocadas (JSON) e rodar o script num ensaio com `ROLLBACK` primeiro. |

## 7. Regras de ouro

- **Teste que escreve no banco só roda no staging.** Nunca na produção, nunca "só dessa vez".
- `supabase db query -f` **commita** o que vem antes de um `BEGIN` do mesmo arquivo — não concatene SQL de teste com outro SQL.
- O link do Supabase CLI deste repositório (`supabase/.temp`) é o da **produção**. Para falar com o staging use `--workdir .staging`
  (os scripts de `scripts/staging/` já fazem isso).
- Segredos (senha do banco, service_role, tokens) ficam na Vercel, no GitHub Secrets ou em `.env.staging.local` — nunca no repositório nem em conversa.
