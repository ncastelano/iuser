# Utilidades dos scripts do Supabase LOCAL (Docker/OrbStack). NÃO é para rodar direto.
# O banco local vive no contêiner `supabase_db_iuser-local` (pasta de trabalho .local-supabase/): sem cota, sem internet, dados descartáveis.
# Tudo aqui só escreve nesse contêiner; a produção só é LIDA (q_prod, usado uma vez para copiar a função de webhook).
import json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORKDIR = os.path.join(ROOT, '.local-supabase')
DB = 'supabase_db_iuser-local'
ORB = os.path.expanduser('~/.orbstack/bin')
ENV = dict(os.environ)
ENV['PATH'] = ORB + ':' + '/Users/ncastelano/.local/node/bin:' + ENV.get('PATH', '')
ENV.pop('SUPABASE_ACCESS_TOKEN', None)
DOCKER = shutil.which('docker', path=ENV['PATH']) or 'docker'


def psql(args, stdin=None):
    r = subprocess.run([DOCKER, 'exec', '-i', DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', *args],
                       input=stdin, capture_output=True, text=True, env=ENV)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip()[:1200])
    return r.stdout


def q_local(sql):
    """SELECT -> lista de dicts (JSON); qualquer outra coisa executa e devolve []."""
    if re.match(r'\s*(with|select)\b', sql, re.I) and not re.search(r'\binto\b', sql, re.I):
        out = psql(['-At', '-c', f"select coalesce(json_agg(t), '[]'::json) from ({sql.rstrip(';')}) t"])
        return json.loads(out.strip() or '[]')
    psql(['-c', sql])
    return []


def sql_file_local(path):
    with open(path) as f:
        psql([], stdin=f.read())
    return []


def status_env():
    r = subprocess.run(['npx', 'supabase', 'status', '-o', 'env', '--workdir', WORKDIR], capture_output=True, text=True, env=ENV, cwd=ROOT)
    out = {}
    for line in r.stdout.splitlines():
        m = re.match(r'^([A-Z_]+)="?(.*?)"?$', line.strip())
        if m:
            out[m.group(1)] = m.group(2)
    return out
