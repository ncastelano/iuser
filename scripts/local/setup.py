#!/usr/bin/env python3
# Monta o Supabase LOCAL completo (sem cota, sem internet): sobe os contêineres, cria o esquema, os dados de configuração, as
# migrations mais novas que o baseline, os jobs e a massa de teste. Rodar de novo recomeça do zero (--reset).
#   python3 scripts/local/setup.py            (sobe, aplica e semeia)
#   python3 scripts/local/setup.py --reset    (apaga e recria o banco local)
#   python3 scripts/local/setup.py --no-seed  (só esquema + configuração)
import argparse, glob, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import ROOT, WORKDIR, ENV, q_local, sql_file_local, status_env

ap = argparse.ArgumentParser()
ap.add_argument('--reset', action='store_true')
ap.add_argument('--no-seed', action='store_true')
a = ap.parse_args()

if not os.path.exists(os.path.join(WORKDIR, 'supabase', 'config.toml')):
    os.makedirs(os.path.join(WORKDIR, 'supabase'), exist_ok=True)
    cfg = open(os.path.join(ROOT, 'supabase', 'config.toml')).read().replace('project_id = "iuser"', 'project_id = "iuser-local"', 1)
    open(os.path.join(WORKDIR, 'supabase', 'config.toml'), 'w').write(cfg)

print('Subindo o Supabase local (a primeira vez baixa as imagens)...')
subprocess.run(['npx', 'supabase', 'start', '--workdir', WORKDIR, '-x', 'vector,logflare,edge-runtime,imgproxy,mailpit'], env=ENV, cwd=ROOT)
env = status_env()
if not env.get('API_URL'):
    sys.exit('Não consegui ler o status do Supabase local. Confira se o OrbStack/Docker está aberto.')

here = os.path.dirname(os.path.abspath(__file__))
args = ['--reset'] if a.reset else []
have = q_local("select count(*)::int n from information_schema.tables where table_schema = 'public' and table_name = 'profiles'")[0]['n']
if not have or a.reset:
    subprocess.run([sys.executable, os.path.join(here, 'apply-baseline.py'), *args], check=True, env=ENV, cwd=ROOT)
    print('Dados de configuração (tarifas, planos, níveis...)')
    sql_file_local(os.path.join(ROOT, 'supabase', 'staging', 'reference-data.sql'))
else:
    print('Esquema já existe (use --reset para recriar).')

# migrations MAIS NOVAS que o baseline (o baseline é a produção até a 20261107)
applied = {r['version'] for r in q_local("select version from supabase_migrations.schema_migrations")} if q_local("select to_regclass('supabase_migrations.schema_migrations') is not null as ok")[0]['ok'] else set()
q_local("create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)")
applied = {r['version'] for r in q_local("select version from supabase_migrations.schema_migrations")}
newer = sorted(p for p in glob.glob(os.path.join(ROOT, 'supabase', 'migrations', '*.sql')) if os.path.basename(p).split('_', 1)[0] > '20261107000000')
for p in newer:
    v, name = os.path.basename(p)[:-4].split('_', 1)
    if v in applied:
        continue
    print('  migration', v, name)
    try:
        sql_file_local(p)
        q_local(f"insert into supabase_migrations.schema_migrations (version, name) values ('{v}', '{name}') on conflict do nothing")
    except Exception as e:
        print('   ! falhou:', str(e)[:300])
        sys.exit(1)

try:
    sql_file_local(os.path.join(ROOT, 'supabase', 'staging', 'cron-jobs.sql'))
    print('Jobs agendados criados')
except Exception as e:
    print('Jobs agendados não criados (pg_cron indisponível?):', str(e)[:160])

print('\nSupabase local pronto:')
print('  API    ', env.get('API_URL'))
print('  Studio ', env.get('STUDIO_URL'))
if not a.no_seed:
    print('\nCriando a massa de teste (contas, lojas, produtos, agendamentos...)')
    seed_env = dict(ENV, STAGING_SUPABASE_URL=env['API_URL'], STAGING_SUPABASE_SERVICE_ROLE_KEY=env['SERVICE_ROLE_KEY'], STAGING_TEST_PASSWORD=os.environ.get('STAGING_TEST_PASSWORD', 'Teste-local-123'))
    for script in ('seed.mjs', 'seed-ecosystem.mjs'):
        print(' ', script)
        if script == 'seed-ecosystem.mjs':
            # o lojista de referência precisa de uma assinatura de loja (no staging ela foi criada à mão): plano Loja, ativo por 1 ano
            q_local("""insert into subscriptions (user_id, plan_id, status, current_period_end, starts_at)
                select p.id, (select id from plans where name = 'Loja' limit 1), 'active', now() + interval '1 year', now()
                from profiles p where p.email = 'lojista@staging.iuser.test'
                and not exists (select 1 from subscriptions s where s.user_id = p.id)""")
        r = subprocess.run(['node', os.path.join(ROOT, 'scripts', 'staging', script)], env=seed_env, cwd=ROOT)
        if r.returncode != 0:
            print('  ! o seed terminou com erro (veja acima)')
            break
print('\nAgora: npm run dev:local')
