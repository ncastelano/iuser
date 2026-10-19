#!/bin/bash
# Testa a senha do banco de PRODUÇÃO do MESMO jeito que o workflow usa (conexão direta pela senha, pooler; só leitura:
# dry-run) e, se estiver certa, guarda como segredo PRODUCTION_DB_PASSWORD no ambiente db-production do GitHub.
# A senha nunca aparece na tela, no histórico nem em arquivo.
#   bash scripts/staging/test-prod-db-password.sh
cd "$(dirname "$0")/../.." || exit 1
printf 'Senha do banco de PRODUÇÃO (não aparece enquanto digita) e Enter: '
read -rs PW
echo
if [ -z "$PW" ]; then echo "Nada digitado."; exit 1; fi
ENC=$(PW="$PW" python3 -c 'import os,urllib.parse;print(urllib.parse.quote(os.environ["PW"],safe=""))')
URL="postgresql://postgres.mqtwehsmkuknkrtrqbnf:${ENC}@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
OUT=$(env -u SUPABASE_ACCESS_TOKEN npx supabase db push --db-url "$URL" --dry-run 2>&1)
if echo "$OUT" | grep -qi "password authentication failed"; then
  echo "SENHA ERRADA: o banco de PRODUÇÃO recusou essa senha."
  unset PW ENC URL; exit 3
elif echo "$OUT" | grep -qi "up to date\|Would push"; then
  echo "SENHA CORRETA: conectou no banco de PRODUÇÃO pela senha (só leitura, nada foi alterado)."
  if printf '%s' "$PW" | gh secret set PRODUCTION_DB_PASSWORD --env db-production --repo ncastelano/iuser >/dev/null 2>&1; then
    echo "Guardada como segredo PRODUCTION_DB_PASSWORD no ambiente db-production do GitHub."
  else
    echo "A senha está certa, mas não consegui guardar no GitHub (gh logado?)."
  fi
  unset PW ENC URL; exit 0
else
  echo "Não consegui concluir o teste:"; echo "$OUT" | grep -iE "failed|error|timeout" | head -3 | sed 's#postgresql://[^ ]*#<url>#g'
  unset PW ENC URL; exit 2
fi
