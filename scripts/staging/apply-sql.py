#!/usr/bin/env python3
# Roda um arquivo SQL no STAGING (nunca na produção). Ex.: python3 scripts/staging/apply-sql.py supabase/staging/reference-data.sql
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import ROOT, sql_file_staging, staging_ref
if len(sys.argv) != 2:
    sys.exit('uso: apply-sql.py <arquivo.sql>')
print('Alvo (STAGING):', staging_ref())
sql_file_staging(os.path.abspath(sys.argv[1]))
print('OK')
