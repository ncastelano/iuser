#!/usr/bin/env python3
# Aponta o diretório .staging/ para o projeto Supabase de STAGING (não mexe no link da produção do repositório).
#   python3 scripts/staging/setup.py --ref <referência do projeto de staging>
# A referência é o trecho "abcdefghijklmnop" da URL https://abcdefghijklmnop.supabase.co (painel → Project Settings → General).
import argparse, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import ROOT, STAGING_DIR, PROD_REF, q_staging

ap = argparse.ArgumentParser()
ap.add_argument('--ref', required=True)
a = ap.parse_args()
ref = a.ref.strip()
if ref == PROD_REF:
    sys.exit('RECUSADO: essa é a referência da PRODUÇÃO. Passe a do projeto de STAGING.')
if not ref.isalnum() or len(ref) != 20:
    sys.exit('Referência inválida: são 20 letras/números (ex.: abcdefghijklmnopqrst).')

os.makedirs(os.path.join(STAGING_DIR, 'supabase', '.temp'), exist_ok=True)
shutil.copy(os.path.join(ROOT, 'supabase', 'config.toml'), os.path.join(STAGING_DIR, 'supabase', 'config.toml'))
open(os.path.join(STAGING_DIR, 'supabase', '.temp', 'project-ref'), 'w').write(ref)
mig = os.path.join(STAGING_DIR, 'supabase', 'migrations')
if not os.path.lexists(mig):
    os.symlink(os.path.join(ROOT, 'supabase', 'migrations'), mig)   # as MESMAS migrations do repositório
print('Testando acesso ao projeto de staging...')
rows = q_staging("select current_database() db, (select count(*) from information_schema.tables where table_schema = 'public') tabelas_public")
print('OK:', rows[0])
