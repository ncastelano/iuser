#!/bin/bash
# Testa a senha do banco de STAGING (só leitura: dry-run) e, se estiver certa, guarda como segredo STAGING_DB_PASSWORD no GitHub.
# Digite a senha quando pedir (não aparece na tela) e aperte Enter. A senha nunca vai para tela, histórico ou arquivo.
#   bash scripts/staging/test-db-password.sh
cd "$(dirname "$0")/../.." || exit 1
printf 'Senha do banco de STAGING (não aparece enquanto digita) e Enter: '
read -rs PW
echo
if [ -z "$PW" ]; then echo "Nada digitado."; exit 1; fi
ENC=$(PW="$PW" python3 -c 'import os,urllib.parse;print(urllib.parse.quote(os.environ["PW"],safe=""))')
URL="postgresql://postgres.avxcbdsgsyyjwfsfeexs:${ENC}@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
OUT=$(env -u SUPABASE_ACCESS_TOKEN npx supabase db push --db-url "$URL" --dry-run 2>&1)
if echo "$OUT" | grep -qi "password authentication failed"; then
  echo "SENHA ERRADA: o banco de STAGING recusou essa senha."
  unset PW; exit 3
elif echo "$OUT" | grep -qi "up to date\|Would push"; then
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
