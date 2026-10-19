#!/bin/bash
# Testa se você lembra da senha do banco de STAGING, sem mostrar nem guardar a senha.
# Digite a senha quando pedir (não aparece na tela) e aperte Enter. Só consulta (dry-run): não altera nada.
#   bash scripts/staging/test-db-password.sh
cd "$(dirname "$0")/../.." || exit 1
printf 'Senha do banco de STAGING (não aparece enquanto digita) e Enter: '
read -rs PW
echo
if [ -z "$PW" ]; then echo "Nada digitado."; exit 1; fi
OUT=$(env -u SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD="$PW" npx supabase db push --linked --workdir .staging --dry-run 2>&1)
unset PW
if echo "$OUT" | grep -qi "login role"; then
  echo "AVISO: o CLI não usou a senha digitada (usou login temporário), então este teste não prova nada."
  exit 2
elif echo "$OUT" | grep -qi "up to date\|DRY RUN"; then
  echo "SENHA CORRETA: conectou no banco de STAGING."
  exit 0
else
  echo "SENHA ERRADA (ou sem conexão):"
  echo "$OUT" | grep -iE "password|auth|FATAL|failed|error" | head -3
  exit 3
fi
