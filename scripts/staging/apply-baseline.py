#!/usr/bin/env python3
# Cria no STAGING o esquema-base (supabase/staging/baseline.sql) e marca todas as migrations já existentes como aplicadas,
# para que "db push" daqui pra frente aplique só as NOVAS.
#   python3 scripts/staging/apply-baseline.py            (recusa se o staging já tiver tabelas; use --reset para recomeçar)
#   python3 scripts/staging/apply-baseline.py --reset    (APAGA o schema public do STAGING e recria — nunca toca produção)
# Variáveis opcionais: STAGING_APP_URL (URL do app de staging, para os webhooks), STAGING_WEBHOOK_SECRET.
import argparse, glob, os, re, secrets, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import ROOT, q_staging, staging_ref

ap = argparse.ArgumentParser()
ap.add_argument('--reset', action='store_true')
a = ap.parse_args()
ref = staging_ref()
print('Alvo (STAGING):', ref)

have = q_staging("select count(*)::int n from information_schema.tables where table_schema = 'public' and table_name = 'profiles'")[0]['n']
if have and not a.reset:
    sys.exit('O staging já tem a tabela profiles. Use --reset para recomeçar do zero (só apaga o STAGING).')
if a.reset:
    print('Limpando o schema public do staging...')
    q_staging("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role; GRANT ALL ON SCHEMA public TO postgres, service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role")
    # políticas de storage.objects de uma aplicação anterior (o schema storage não é recriado)
    q_staging("DO $$ DECLARE r record; BEGIN FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' LOOP EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname); END LOOP; END $$")

app_url = os.environ.get('STAGING_APP_URL', 'https://staging.invalid').rstrip('/')
secret = os.environ.get('STAGING_WEBHOOK_SECRET') or secrets.token_urlsafe(32)

text = open(os.path.join(ROOT, 'supabase', 'staging', 'baseline.sql')).read()
text = text.replace('__APP_URL__', app_url).replace('__STAGING_WEBHOOK_SECRET__', secret)
blocks = re.findall(r'-- @@ (\d+)\|([^\n]*)\n(.*?)(?=\n-- @@ |\Z)', text, re.S)
stmts = [(int(p), d, s.strip()) for p, d, s in blocks]
print(f'{len(stmts)} comandos do baseline')

tmp = tempfile.mkdtemp()
def run(sql, name='x'):
    path = os.path.join(tmp, name + '.sql')
    open(path, 'w').write(sql)
    from _common import sql_file_staging
    return sql_file_staging(path)

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
print('Comandos carregados; aplicando por passadas (os que dependem de outros são repetidos)...')

APPLY = """
DO $A$
DECLARE r record; k int := %d; done_n int := 0; fail_n int := 0;
BEGIN
  FOR r IN SELECT ord, sql FROM public._baseline_stmts WHERE NOT done AND attempt < k ORDER BY ord LIMIT 150 LOOP
    BEGIN
      EXECUTE r.sql;
      UPDATE public._baseline_stmts SET done = true, err = NULL, attempt = k WHERE ord = r.ord; done_n := done_n + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public._baseline_stmts SET err = SQLERRM, attempt = k WHERE ord = r.ord; fail_n := fail_n + 1;
    END;
  END LOOP;
END $A$;
"""
for k in range(1, 9):
    while True:
        pending = q_staging(f"select count(*)::int n from public._baseline_stmts where not done and attempt < {k}")[0]['n']
        if pending == 0:
            break
        run(APPLY % k, f'apply{k}')
    left = q_staging("select count(*)::int n from public._baseline_stmts where not done")[0]['n']
    print(f'  passada {k}: restam {left}')
    if left == 0:
        break

fails = q_staging("select ord, descr, left(err, 220) err from public._baseline_stmts where not done order by ord")
if fails:
    print(f'\nATENÇÃO: {len(fails)} comando(s) não aplicaram:')
    for f in fails[:60]:
        print(f"  [{f['ord']}] {f['descr']}  ->  {f['err']}")
    print('A tabela public._baseline_stmts foi mantida para diagnóstico.')
    sys.exit(1)

run('DROP TABLE public._baseline_stmts', 'drop')
# histórico de migrations: tudo que existe hoje já está "dentro" do baseline
versions = sorted(os.path.basename(p).split('_', 1) for p in glob.glob(os.path.join(ROOT, 'supabase', 'migrations', '*.sql')))
vals = ',\n'.join("('" + v + "', '" + n.replace('.sql', '').replace("'", "''") + "')" for v, n in versions)
run('CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text); '
    'INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES\n' + vals + '\nON CONFLICT (version) DO NOTHING;', 'migs')
print(f'Pronto: baseline aplicado e {len(versions)} migrations marcadas como aplicadas. Webhook secret do staging: gerado/usado (guarde-o na Vercel se for usar webhooks).')
