#!/bin/bash
# Testa a senha do banco de STAGING (só leitura: dry-run) e, se estiver certa, guarda como segredo STAGING_DB_PASSWORD no GitHub.
# Digite a senha quando pedir (não aparece na tela) e aperte Enter. A senha nunca vai para tela, histórico ou arquivo.
#   bash scripts/staging/test-db-password.sh
cd "$(dirname "$0")/../.." || exit 1
printf 'Senha do banco de STAGING (não aparece enquanto digita) e Enter: '
read -rs PW
echo
if [ -z "$PW" ]; then echo "Nada digitado."; exit 1; fi
OUT=$(env -u SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD="$PW" npx supabase db push --linked --workdir .staging --dry-run 2>&1)
if echo "$OUT" | grep -qi "login role"; then
  echo "AVISO: o CLI não usou a senha digitada (usou login temporário), então este teste não prova nada."
  unset PW; exit 2
elif echo "$OUT" | grep -qi "up to date\|DRY RUN"; then
  echo "SENHA CORRETA: conectou no banco de STAGING (só leitura, nada foi alterado)."
  if printf '%s' "$PW" | gh secret set STAGING_DB_PASSWORD --repo ncastelano/iuser >/dev/null 2>&1; then
    echo "Guardada como segredo STAGING_DB_PASSWORD no GitHub."
  else
    echo "A senha está certa, mas não consegui guardar no GitHub (gh logado?)."
  fi
  unset PW; exit 0
else
  echo "SENHA ERRADA (ou sem conexão):"
  echo "$OUT" | grep -iE "password|auth|FATAL|failed|error" | head -3
  unset PW; exit 3
fi
