# Utilidades compartilhadas dos scripts de staging. NÃO é para rodar direto.
#
# REGRA DE OURO: tudo que ESCREVE passa por target_workdir(), que só aceita o projeto de STAGING (pasta .staging/) e
# recusa a referência do projeto de produção. A produção só é LIDA (export-*), nunca escrita por estes scripts.
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROD_REF = 'mqtwehsmkuknkrtrqbnf'          # projeto de produção (não é segredo: está na URL pública do app)
STAGING_DIR = os.path.join(ROOT, '.staging')
ENV = dict(os.environ)
ENV.pop('SUPABASE_ACCESS_TOKEN', None)      # o token do MCP é só de leitura e quebra o CLI


def staging_ref():
    p = os.path.join(STAGING_DIR, 'supabase', '.temp', 'project-ref')
    if not os.path.exists(p):
        sys.exit('Staging ainda não configurado. Rode: python3 scripts/staging/setup.py --ref <REFERÊNCIA_DO_PROJETO_DE_STAGING>')
    ref = open(p).read().strip()
    if ref == PROD_REF or not ref:
        sys.exit('RECUSADO: a referência configurada como staging é a da PRODUÇÃO. Rode setup.py com o projeto de staging.')
    return ref


def _run(args, workdir):
    cmd = ['npx', 'supabase', 'db', 'query', '--linked', '--workdir', workdir] + args
    r = subprocess.run(cmd, capture_output=True, text=True, env=ENV, cwd=ROOT)
    return r.stdout + r.stderr


def _parse(out):
    m = re.search(r'^\{.*?^\}', out, re.S | re.M)
    if m and '"rows"' in m.group(0):
        return json.loads(m.group(0))['rows']
    msg = re.search(r'message":"(.*?)"\}', out, re.S)
    raise RuntimeError((msg.group(1) if msg else out[:800]).replace('\\n', '\n'))


def q_prod(sql):
    """LEITURA da produção (projeto linkado da raiz do repositório)."""
    out = subprocess.run(['npx', 'supabase', 'db', 'query', '--linked', sql], capture_output=True, text=True, env=ENV, cwd=ROOT)
    return _parse(out.stdout + out.stderr)


def q_staging(sql):
    staging_ref()
    return _parse(_run([sql], STAGING_DIR))


def sql_file_staging(path):
    staging_ref()
    return _parse(_run(['-f', path], STAGING_DIR))
