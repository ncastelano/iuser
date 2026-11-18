# iUser pronto para comercializar? Revisão de segurança e jurídica (18/11/2026)

Pergunta do dono: *"quero já comercializar o iUser; existe algum jeito de eu ter problema, seja de jurisdição, seja de pessoas
tentando se aproveitar de alguma vulnerabilidade? O que pode estar faltando?"*

Resumo: a base de segurança do iUser é **boa** — dados privados protegidos no próprio banco, uploads controlados, webhooks
conferidos, cofre do administrador. A revisão achou e **corrigiu** (staging, aguardando publicação) uma falha grave na
versão do Next.js, várias brechas de fraude e dois buracos jurídicos visíveis (termos e privacidade dando 404).
O que falta agora é sobretudo **trabalho de empresa**: CNPJ, contador, advogado e algumas regras de cidade e de ramo.

> Isto não é parecer jurídico. A parte jurídica é um mapa do que levar ao advogado e ao contador, com o que o código
> já faz para ajudar.

---

## 1. O que foi CORRIGIDO nesta revisão (no staging; vai para produção na próxima publicação)

| # | Problema | Gravidade | Correção |
|---|---|---|---|
| 1 | **Next.js 16.2.4** tinha falhas publicadas de **execução de código no servidor sem login** (otimizador de imagens com AVIF/SVG, `next/og`, `use cache`), **desvio do proxy** e negação de serviço | **Crítica** | Atualizado para **16.4.6** (sem nenhuma falha conhecida). `npm audit fix` nas outras dependências. Build completo passando. |
| 2 | `/privacidade` estava fora da lista do `proxy.ts` e **dava 404 em produção** (Google Play e Meta exigem a URL) | Alta (loja de apps / WhatsApp) | Rota liberada; política **reescrita** (controlador, bases legais, retenção, transferência internacional, CPF, cookies, menores, direitos). |
| 3 | O cadastro dizia "você concorda com os **Termos de Uso**", mas **`/termos` não existia** | Alta (jurídica) | Página criada, escrita a partir de como o app funciona hoje. |
| 4 | Qualquer visitante podia se dar as **molduras de prêmio** (nível e Pré-pago), encerrar a espera de qualquer corrida e fechar rodadas de comunidade (funções internas abertas) | Média | Funções internas fora do alcance do app (migration 079). |
| 5 | Qualquer visitante podia **"queimar" os códigos do Club VIP** de qualquer loja | Média | Só o banco consome o código ao fechar o pedido. |
| 6 | **Ranking do Outdoor manipulável**: visualizações e compartilhamentos sem limite (um script subia qualquer loja/produto) | Média (justiça do ranking) | Logado: 1 vez por pessoa/item/dia. Visitante: até 30 por item por hora; compartilhamento de visitante não conta. |
| 7 | "Quem visitou seu perfil" aceitava **identidade falsa** (o app dizia quem era o visitante) | Média | Quem visitou = o login; teto para anônimos. |
| 8 | Telemetria do Admin podia ser enchida com números falsos | Baixa | Valores limitados por chamada; do navegador só o Mapbox. |
| 9 | **Redirecionamento aberto**: `iuser.com.br/login?redirect=https://site-falso` mandava a pessoa, logo depois de digitar a senha, para uma página de golpe | Média (phishing) | Só caminho interno (`lib/safeRedirect.ts`), também no `?next=` dos painéis. |
| 10 | Site sem **cabeçalhos de segurança**: outro site podia abrir o iUser numa moldura invisível e induzir toques (clickjacking) | Média | `X-Frame-Options`, `frame-ancestors`, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. |
| 11 | O cliente podia **pagar o Pix da loja enquanto o pedido ainda esperava entregador**; se ninguém aceitasse (cancelamento em 15 min), ficava com um reembolso a cobrar de uma loja que nem viu o pedido | Média (dinheiro do cliente) | Migration 080: o Pix da loja só aparece quando ela recebe o pedido. |

Testes: `supabase/tests/security_hardening_scenarios.sql` (6 grupos), `npm run test:safe-redirect`, `test:order-payment`,
`test:security-exposure`, build de produção. Rollbacks em `supabase/rollbacks/security_hardening_rollback.sql` e
`order_payment_after_release_rollback.sql`.

## 2. O que já estava BOM (não precisa refazer)

- Dados privados (CPF, telefone, Pix, endereço, coordenadas) protegidos **no banco**, por coluna, com testes automáticos.
- Pedidos, preços, fretes e corridas calculados e conferidos pelo banco (o app não consegue mandar um preço falso).
- Uploads: tipo, tamanho, cota, ritmo e bloqueio por pessoa; arquivos pagos só por link temporário.
- Webhooks (Asaas, WhatsApp) conferem assinatura/token; prévia de links protegida contra SSRF.
- Admin geral por login + cofre do manual com digital/rosto.
- Moderação com denúncia, ocultação automática e decisão do admin.
- O iUser **não guarda dinheiro de terceiros** (pagamento direto entre as partes): isso evita boa parte da regulação do
  Banco Central para instituições de pagamento. **Mantenha assim.** O Pix automático dos digitais (subconta/split) muda
  isso e deve ser feito só com a Asaas fazendo a parte regulada.

## 3. Segurança: o que AINDA falta (técnico), por prioridade

1. **Plano pago do Supabase antes de vender.** Em outubro a cota grátis travou produção **e** staging (erro 402).
   Com clientes pagando, um bloqueio desses é indisponibilidade. O plano pago também traz **backup diário restaurável**.
   Hoje, se o banco for perdido ou corrompido, não há garantia de volta. Confirme no painel e teste uma restauração.
2. **Verificação em duas etapas (2FA) em todas as contas que controlam o iUser:** Supabase, Vercel, GitHub, Cloudflare,
   Hostinger (domínio), Asaas, Google/Firebase, Meta e o e-mail do administrador. Quem invade uma delas leva tudo.
3. **Chave de PRODUÇÃO da Asaas no `.env.local`** do computador de desenvolvimento: troque por uma chave de sandbox local
   e gere uma chave nova de produção (só na Vercel).
4. **Supabase Auth em produção:** ligar a "proteção contra senhas vazadas", confirmação de e-mail e limite de tentativas
   (tela Authentication → Settings). O `/api/auth/cpf-available` limita tentativas só na memória de cada servidor; com
   tráfego, mova para um limite no banco.
5. **CSP completa** (quais scripts podem rodar): hoje só a parte de molduras. Fazer em modo "somente relatório" primeiro,
   porque Mapbox, Supabase, Firebase e pdf.js precisam estar liberados.
6. **Moderação de perfis, lojas e produtos** (hoje só conteúdo: flash, comentários, publicações, avaliações, mensagens,
   digitais). Golpista com loja falsa não pode ser denunciado pelo app.
7. **Monitoramento de erros e alertas** (ex.: Sentry) e um canal `security.txt` para quem achar falha.
8. Antes de crescer: **teste de invasão (pentest) por terceiro**.

## 4. Jurídico: o que levar ao CONTADOR e ao ADVOGADO

### 4.1 Empresa e impostos (contador) — antes da primeira cobrança
- **CNPJ** para operar (o MEI dificilmente cobre intermediação de plataforma). Definir CNAE e o item do ISS de Porto Velho.
- **Nota fiscal** sobre o que o iUser cobra (planos Pré e Pós-pago). Cada loja emite a nota do que vende.
- **Comissões do programa Convidados** pagas a pessoas físicas: como declarar (retenções, recibo).
- **Registro da marca "iUser" no INPI.**
- Preencher os dados da empresa em `src/components/legal/LegalDoc.tsx` (`LEGAL_ENTITY`: razão social, CNPJ, endereço,
  encarregado): aparecem sozinhos nos Termos e na Privacidade.

### 4.2 Textos (advogado)
- Revisar os **Termos de Uso** e a **Política de Privacidade** criados nesta revisão.
- **Registrar o aceite**: hoje o cadastro só diz "ao criar a conta você concorda". O ideal é guardar a versão aceita e
  a data (fácil de fazer quando o texto estiver aprovado).
- **Decreto 7.962/2013 (comércio eletrônico):** quem vende pela internet precisa mostrar nome/razão social, CPF/CNPJ e
  endereço. A página das lojas **não mostra** isso hoje. Sugestão: um bloco "Quem vende" na loja (dado que a loja já
  informa, tornado público só para lojas).
- **Direito de arrependimento (CDC art. 49):** 7 dias nas compras online. Responsabilidade da loja, mas o termo e a
  tela de pedidos podem explicar.

### 4.3 LGPD
- **Encarregado (DPO):** pode ser o próprio dono; empresas pequenas podem ser dispensadas pela ANPD, mas precisam de um
  canal de contato (já existe: contato@iuser.com.br).
- **Registro das operações de tratamento** (uma planilha do que se coleta, para quê e com quem compartilha: a
  Política de Privacidade já tem essa lista).
- **Plano para incidente** (quem avisa a ANPD e as pessoas, em quanto tempo).
- **Registros de acesso por 6 meses** (Marco Civil art. 15): o login do Supabase registra IP e horário (tabela de
  auditoria do Auth). Confirme com o advogado se basta e não apague essa tabela.

### 4.4 Riscos por área do negócio

| Área | Risco | O que fazer |
|---|---|---|
| **Corridas de passageiros** | Lei 12.587/2012 com a Lei 13.640/2018: a **cidade regulamenta** o transporte por aplicativo; exige do motorista CNH com "exerce atividade remunerada", seguro **APP** (acidentes pessoais a passageiros), INSS e requisitos do veículo | Consultar a lei de Porto Velho (pode exigir cadastro da empresa e dos motoristas); pedir no cadastro do motorista a declaração de CNH EAR e seguro APP |
| **Entregas de moto** | Lei 12.009/2009 e CTB art. 139-A: motofrete precisa de autorização da cidade, curso e equipamentos | Mesma consulta; declaração no cadastro do entregador |
| **Vínculo de emprego** | Motoristas e entregadores de app: tema em julgamento no STF (Tema 1291) | Manter a autonomia (escolher quando, o quê e por quanto). Bloqueios automáticos (3 desistências, repasse atrasado) são regras de segurança: deixar escritas nos Termos (já estão) e com revisão humana |
| **Produtos com regra própria** | Remédios (ANVISA, venda remota só por farmácia), bebida para menor (crime, ECA art. 243), gás de cozinha (autorização da ANP), tabaco | Termos já põem a responsabilidade na loja; sugerido: declaração de licença ao cadastrar nesses ramos e confirmação de 18+ na compra de bebida |
| **Aluguel de imóveis** | Cobrar comissão sobre aluguel é corretagem (exige CRECI) | Manter como **anúncio** (taxa por anúncio, como hoje), nunca porcentagem do aluguel |
| **Conteúdo e música** | Marco Civil art. 19: a plataforma só responde depois de ordem judicial, **exceto** nudez íntima (art. 21: retirar ao ser avisado) | Denúncia já existe; o admin precisa agir rápido nesses casos. Notificação de direito autoral já está nos Termos |
| **Programa Convidados** | Risco de ser visto como pirâmide (Lei 1.521/1951) | O desenho atual é seguro: comissão **só sobre pagamento real de plano** e **só para quem indicou diretamente** (um nível, não cadeia). Não criar ganho em vários níveis nem taxa de adesão |
| **Dinheiro** | Guardar/repassar dinheiro de terceiros exige autorização do Banco Central | Manter o modelo atual (pagamento direto; o iUser só registra) |

## 5. Ordem sugerida

1. Publicar as correções desta revisão (migrations 074–080 + código) — **o Next.js atualizado é o item mais urgente**.
2. Plano pago do Supabase + backup + 2FA em todas as contas + trocar a chave da Asaas.
3. CNPJ e contador; preencher `LEGAL_ENTITY`; advogado revisa Termos e Privacidade.
4. Lei municipal de Porto Velho (transporte e motofrete) antes de divulgar as corridas.
5. "Quem vende" nas lojas (Decreto 7.962) e o aceite registrado dos termos.
