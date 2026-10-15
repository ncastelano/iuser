# 0003 — Acesso à interface 3.0 liberado pelo administrador

**Status:** aceita · **Data:** 2026-10-15

## Contexto
A 3.0 está sendo migrada página a página. Até estar pronta, ninguém além do administrador deve vê-la ou ser
convidado a ela, mas o admin precisa poder abrir a experiência a perfis específicos (e depois a todos).

## Decisão
- Permissão = administrador geral **ou** perfil em `ui_v3_access` **ou** `feature_flags.ui_v3` ligada ("para todos").
- Só o servidor concede (`/api/admin/ui-access`, chave de serviço). A pessoa apenas **lê** a própria linha (RLS):
  ninguém se auto-libera, e a coluna `preferred_version` nunca é prova de permissão.
- A regra é aplicada no proxy e no layout (mesma função): cookie `v3` sem permissão é ignorado.
- Cliente só pergunta (`GET /api/ui-version/access`) para decidir **mostrar** o convite; nunca decide servir a 3.0.
- Administrador entra pelo botão flutuante **v3** na homepage 2.0; o drawer da 3.0 mantém o caminho de volta.
- Na 3.0, todas as páginas abrem na casca (Header da 2.0 em modo compacto); telas cheias ficam de fora.

## Alternativas consideradas
- **Coluna `profiles.v3_access`** — `profiles` é legível por todos e, dependendo do RLS, gravável pelo dono: risco
  de auto-liberação e de vazar quem tem acesso. Rejeitado.
- **Allowlist por e-mail em variável de ambiente** — sem interface e exige deploy para mudar. Rejeitado.
- **Cookie assinado** — mais complexo e sem revogação imediata. Rejeitado.

## Consequências
- Revogar vale na próxima requisição (cache de 30 s no servidor).
- Dois lookups no servidor para quem usa a 3.0 (usuário e permissão), ambos em cache curto.
