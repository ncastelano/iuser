#!/bin/bash
# Testa a senha do banco de PRODUÇÃO (só leitura: dry-run, não aplica nada) e, se estiver certa,
# guarda como segredo PRODUCTION_DB_PASSWORD no ambiente db-production do GitHub.
# A senha nunca aparece na tela, no histórico nem em arquivo.
#   bash scripts/staging/test-prod-db-password.sh
cd "$(dirname "$0")/../.." || exit 1
printf 'Senha do banco de PRODUÇÃO (não aparece enquanto digita) e Enter: '
read -rs PW
echo
if [ -z "$PW" ]; then echo "Nada digitado."; exit 1; fi
OUT=$(env -u SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD="$PW" npx supabase db push --linked --dry-run 2>&1)
if echo "$OUT" | grep -qi "login role"; then
  echo "AVISO: o CLI não usou a senha digitada (usou login temporário), então este teste não prova nada."
  unset PW; exit 2
elif echo "$OUT" | grep -qi "up to date\|DRY RUN"; then
  echo "SENHA CORRETA: conectou no banco de PRODUÇÃO (só leitura, nada foi alterado)."
  if printf '%s' "$PW" | gh secret set PRODUCTION_DB_PASSWORD --env db-production --repo ncastelano/iuser >/dev/null 2>&1; then
    echo "Guardada como segredo PRODUCTION_DB_PASSWORD no ambiente db-production do GitHub."
  else
    echo "A senha está certa, mas não consegui guardar no GitHub (gh logado?)."
  fi
  unset PW; exit 0
else
  echo "SENHA ERRADA (ou sem conexão):"
  echo "$OUT" | grep -iE "password|auth|FATAL|failed|error" | head -3
  unset PW; exit 3
fi
