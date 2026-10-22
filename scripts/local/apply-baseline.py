#!/usr/bin/env python3
# Cria no Supabase LOCAL o esquema-base (supabase/staging/baseline.sql, o mesmo do staging) e marca as migrations já incluídas.
#   python3 scripts/local/apply-baseline.py [--reset]
# Mesmo aplicador do staging: cada comando do baseline vai para uma tabela temporária e é repetido por passadas, porque uns dependem de outros.
import argparse, glob, os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import ROOT, q_local, sql_file_local

ap = argparse.ArgumentParser()
ap.add_argument('--reset', action='store_true')
a = ap.parse_args()

have = q_local("select count(*)::int n from information_schema.tables where table_schema = 'public' and table_name = 'profiles'")[0]['n']
if have and not a.reset:
    sys.exit('O banco local já tem a tabela profiles. Use --reset para recomeçar do zero.')
if a.reset:
    print('Limpando o schema public local...')
    q_local("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role; GRANT ALL ON SCHEMA public TO postgres, service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role")
    q_local("DO $$ DECLARE r record; BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' LOOP EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname); END LOOP; END $$")

# schema supabase_functions (webhooks de banco): o local já traz o schema; se faltar a função, copia a da produção (só leitura)
if not q_local("select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'supabase_functions' and p.proname = 'http_request'")[0]['n']:
    sys.path.insert(0, os.path.join(ROOT, 'scripts', 'staging'))
    import importlib.util
    spec = importlib.util.spec_from_file_location('stg', os.path.join(ROOT, 'scripts', 'staging', '_common.py'))
    stg = importlib.util.module_from_spec(spec); spec.loader.exec_module(stg)
    fn = stg.q_prod("select pg_get_functiondef('supabase_functions.http_request()'::regprocedure) d")[0]['d']
    q_local("create schema if not exists supabase_functions; grant usage on schema supabase_functions to postgres, anon, authenticated, service_role; " + fn)
q_local("create table if not exists supabase_functions.hooks (id bigserial primary key, hook_table_id integer not null, hook_name text not null, created_at timestamptz default now(), request_id bigint); grant all on supabase_functions.hooks to postgres, service_role; grant usage, select on sequence supabase_functions.hooks_id_seq to postgres, service_role")

import re
text = open(os.path.join(ROOT, 'supabase', 'staging', 'baseline.sql')).read()
text = text.replace('__APP_URL__', 'http://127.0.0.1:3000').replace('__STAGING_WEBHOOK_SECRET__', 'local-webhook-secret')
blocks = re.findall(r'-- @@ (\d+)\|([^\n]*)\n(.*?)(?=\n-- @@ |\Z)', text, re.S)
stmts = [(int(p), d, s.strip()) for p, d, s in blocks]
print(f'{len(stmts)} comandos do baseline')

tmp = tempfile.mkdtemp()
def run(sql, name='x'):
    path = os.path.join(tmp, name + '.sql')
    open(path, 'w').write(sql)
    return sql_file_local(path)

run('DROP TABLE IF EXISTS public._baseline_stmts; CREATE TABLE public._baseline_stmts (ord int primary key, phase int, descr text, sql text, done boolean default false, attempt int default 0, err text);', 'init')
CH = 120_000
buf, size, n = [], 0, 0
def flush():
    global buf, size, n
    if buf:
        run('INSERT INTO public._baseline_stmts (ord, phase, descr, sql) VALUES\n' + ',\n'.join(buf) + ';', f'ins{n}')
        n += 1
    buf, size = [], 0
for i, (ph, d, s) in enumerate(stmts):
    tag = f'$b{i}$'
    row = f"({i}, {ph}, $d{i}${d}$d{i}$, {tag}{s}{tag})"
    if size + len(row) > CH:
        flush()
    buf.append(row); size += len(row)
flush()
print('Comandos carregados; aplicando por passadas...')

APPLY = """
DO $A$
DECLARE r record; k int := %d;
BEGIN
  PERFORM set_config('check_function_bodies', 'off', true);
  FOR r IN SELECT ord, sql FROM public._baseline_stmts WHERE NOT done AND attempt < k ORDER BY ord LIMIT 150 LOOP
    BEGIN
      EXECUTE r.sql;
      UPDATE public._baseline_stmts SET done = true, err = NULL, attempt = k WHERE ord = r.ord;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public._baseline_stmts SET err = SQLERRM, attempt = k WHERE ord = r.ord;
    END;
  END LOOP;
END $A$;
"""
for k in range(1, 9):
    while True:
        pending = q_local(f"select count(*)::int n from public._baseline_stmts where not done and attempt < {k}")[0]['n']
        if pending == 0:
            break
        run(APPLY % k, f'apply{k}')
    left = q_local("select count(*)::int n from public._baseline_stmts where not done")[0]['n']
    print(f'  passada {k}: restam {left}')
    if left == 0:
        break

fails = q_local("select ord, descr, left(err, 220) err from public._baseline_stmts where not done order by ord")
if fails:
    print(f'\nATENÇÃO: {len(fails)} comando(s) não aplicaram:')
    for f in fails[:60]:
        print(f"  [{f['ord']}] {f['descr']}  ->  {f['err']}")
    sys.exit(1)
run('DROP TABLE public._baseline_stmts', 'drop')
print('Baseline aplicado.')
