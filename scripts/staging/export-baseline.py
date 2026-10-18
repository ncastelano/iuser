#!/usr/bin/env python3
# Gera o ESQUEMA-BASE do iUser (sem nenhum dado) lendo o banco de PRODUÇÃO só em leitura, para criar o staging.
#
# Por que existe: as migrations em supabase/migrations NÃO começam do zero — as tabelas mais antigas (profiles, stores...)
# foram criadas pelo painel do Supabase, então as 255 migrations sozinhas não recriam o banco. Este script lê o catálogo do
# Postgres e escreve o DDL (tabelas, funções, triggers, políticas, grants, views, índices, storage, realtime) em
# supabase/staging/baseline.sql. Rodar de novo quando quiser "re-sincronizar" o staging com a produção.
#
# Só LÊ. Nunca escreve na produção. Usa o projeto linkado do diretório de trabalho (o de produção).
#   python3 scripts/staging/export-baseline.py
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'supabase', 'staging', 'baseline.sql')
ENV = dict(os.environ)
ENV.pop('SUPABASE_ACCESS_TOKEN', None)  # o token do MCP é só de leitura e quebra o CLI


def q(sql):
    r = subprocess.run(['npx', 'supabase', 'db', 'query', '--linked', sql], capture_output=True, text=True, env=ENV, cwd=ROOT)
    out = r.stdout + r.stderr
    m = re.search(r'^\{.*?^\}', out, re.S | re.M)
    if not m or '"rows"' not in m.group(0):
        sys.exit('ERRO consultando o banco:\n' + out[:1500])
    return json.loads(m.group(0))['rows']


def ident(s):
    return '"' + s.replace('"', '""') + '"'


stmts = []  # (fase, descrição, sql)

APP_HOSTS = ('https://www.iuser.com.br', 'https://iuser.com.br')


def sanitize(sql):
    """Gatilhos de webhook carregam a URL do app e um segredo. O segredo NUNCA vai para o git, e a URL vira marcador:
    o aplicador do staging troca por valores do staging (STAGING_APP_URL / STAGING_WEBHOOK_SECRET)."""
    sql = re.sub(r'("x-webhook-secret"\s*:\s*")[^"]+(")', r'\1__STAGING_WEBHOOK_SECRET__\2', sql)
    for h in APP_HOSTS:
        sql = sql.replace(h, '__APP_URL__')
    return sql


def add(phase, desc, sql):
    stmts.append((phase, desc, sql.strip().rstrip(';') + ';'))


NOT_EXT = "not exists (select 1 from pg_depend d where d.objid = {oid} and d.deptype = 'e')"

# ---------------------------------------------------------------- 1. extensões
for r in q("select extname, extnamespace::regnamespace::text sch from pg_extension where extname not in ('plpgsql','pg_stat_statements','supabase_vault','pg_net','pg_cron') order by 1"):
    add(10, 'extension ' + r['extname'], f'CREATE EXTENSION IF NOT EXISTS {ident(r["extname"])} WITH SCHEMA {ident(r["sch"])}')
# pg_net e pg_cron são criados pelo painel/Supabase no projeto novo; o baseline não mexe neles.

# ---------------------------------------------------------------- 2. tipos
for r in q("""select t.typname, t.typtype::text typtype, format_type(t.typbasetype, t.typtypmod) base,
    (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid) labels
    from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype in ('e','d')
    and not exists (select 1 from pg_class c where c.reltype = t.oid)
    and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e') order by 1"""):
    if r['typtype'] == 'e':
        add(20, 'enum ' + r['typname'], f'CREATE TYPE public.{ident(r["typname"])} AS ENUM ({r["labels"]})')
    else:
        add(20, 'domain ' + r['typname'], f'CREATE DOMAIN public.{ident(r["typname"])} AS {r["base"]}')

# ---------------------------------------------------------------- 3. sequências
for r in q("""select c.relname, format_type(s.seqtypid, null) typ, s.seqstart, s.seqincrement, s.seqmin, s.seqmax, s.seqcycle
    from pg_class c join pg_sequence s on s.seqrelid = c.oid
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'S' and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype in ('i','a')) order by 1"""):
    add(30, 'sequence ' + r['relname'], f'CREATE SEQUENCE IF NOT EXISTS public.{ident(r["relname"])} AS {r["typ"]} START {r["seqstart"]} INCREMENT {r["seqincrement"]} MINVALUE {r["seqmin"]} MAXVALUE {r["seqmax"]}' + (' CYCLE' if r['seqcycle'] else ''))

# ---------------------------------------------------------------- 4. tabelas (colunas puras; defaults/generated depois das funções)
tables = q("""select c.oid::int oid, c.relname, c.relrowsecurity rls, c.relforcerowsecurity frls, c.relpersistence::text pers
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') order by c.relname""")
cols = q("""select a.attrelid::int oid, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) typ, a.attnotnull nn,
    a.attidentity::text ident, a.attgenerated::text gen, pg_get_expr(d.adbin, d.adrelid) def
    from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    join pg_class c on c.oid = a.attrelid
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped order by a.attrelid, a.attnum""")
by_oid = {}
for c in cols:
    by_oid.setdefault(c['oid'], []).append(c)
deferred_cols = []  # (tabela, coluna, tipo, nn, gen/def)
for t in tables:
    lines = []
    for c in by_oid.get(t['oid'], []):
        if c['gen'] == 's':  # coluna gerada: depende de funções -> depois
            deferred_cols.append((t['relname'], c, 'generated'))
            continue
        piece = f'{ident(c["attname"])} {c["typ"]}'
        if c['ident'] in ('a', 'd'):
            piece += ' GENERATED ' + ('ALWAYS' if c['ident'] == 'a' else 'BY DEFAULT') + ' AS IDENTITY'
        elif c['def'] is not None:
            deferred_cols.append((t['relname'], c, 'default'))
        if c['nn']:
            piece += ' NOT NULL'
        lines.append(piece)
    unlogged = 'UNLOGGED ' if t['pers'] == 'u' else ''
    add(40, 'table ' + t['relname'], f'CREATE {unlogged}TABLE public.{ident(t["relname"])} (\n    ' + ',\n    '.join(lines) + '\n)')

# ---------------------------------------------------------------- 5. funções (corpo não é validado na criação)
for r in q("""select p.oid::regprocedure::text sig, pg_get_functiondef(p.oid) def from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') order by p.proname, p.oid"""):
    add(50, 'function ' + r['sig'], sanitize(r['def']))

# ---------------------------------------------------------------- 6. defaults e colunas geradas
for tname, c, kind in deferred_cols:
    if kind == 'default':
        add(60, f'default {tname}.{c["attname"]}', f'ALTER TABLE public.{ident(tname)} ALTER COLUMN {ident(c["attname"])} SET DEFAULT {c["def"]}')
    else:
        add(61, f'generated {tname}.{c["attname"]}', f'ALTER TABLE public.{ident(tname)} ADD COLUMN {ident(c["attname"])} {c["typ"]} GENERATED ALWAYS AS ({c["def"]}) STORED')

# ---------------------------------------------------------------- 7. constraints (PK/unique/check antes; FK depois)
cons = q("""select c.conrelid::regclass::text tbl, c.conname, c.contype::text ctype, pg_get_constraintdef(c.oid) def
    from pg_constraint c join pg_class r on r.oid = c.conrelid
    where r.relnamespace = 'public'::regnamespace and r.relkind = 'r' and c.contype in ('p','u','c','f','x') and c.conparentid = 0
    and not exists (select 1 from pg_depend d where d.objid = r.oid and d.deptype = 'e') order by r.relname, c.contype::text, c.conname""")
for c in cons:
    tbl = c['tbl'] if c['tbl'].startswith('public.') else 'public.' + c['tbl']
    phase = 80 if c['ctype'] == 'f' else 70
    # NOT NULL de coluna já foi tratado nas colunas; checks "IS NOT NULL" gerados pelo PG 18 não existem aqui
    add(phase, f'constraint {c["conname"]}', f'ALTER TABLE {tbl} ADD CONSTRAINT {ident(c["conname"])} {c["def"]}')

# ---------------------------------------------------------------- 8. índices (os que não nascem de constraint)
for r in q("""select i.indexrelid::regclass::text name, pg_get_indexdef(i.indexrelid) def from pg_index i
    join pg_class t on t.oid = i.indrelid
    where t.relnamespace = 'public'::regnamespace and t.relkind = 'r'
    and not exists (select 1 from pg_constraint c where c.conindid = i.indexrelid)
    and not exists (select 1 from pg_depend d where d.objid = i.indexrelid and d.deptype = 'e')
    and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e') order by 1"""):
    add(90, 'index ' + r['name'], r['def'])

# ---------------------------------------------------------------- 9. views (podem depender umas das outras: o aplicador repete)
for r in q("""select c.relname, pg_get_viewdef(c.oid, true) def, coalesce(array_to_string(c.reloptions, ','), '') opts
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') order by c.relname"""):
    with_opts = f' WITH ({r["opts"]})' if r['opts'] else ''
    add(100, 'view ' + r['relname'], f'CREATE OR REPLACE VIEW public.{ident(r["relname"])}{with_opts} AS {r["def"].strip().rstrip(";")}')

# ---------------------------------------------------------------- 10. triggers (public + o de auth.users)
for r in q("""select t.tgname, c.relnamespace::regnamespace::text sch, c.relname, pg_get_triggerdef(t.oid) def
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal and ((c.relnamespace = 'public'::regnamespace and c.relkind = 'r') or (c.relnamespace = 'auth'::regnamespace and c.relname = 'users'))
    and t.tgparentid = 0 order by c.relname, t.tgname"""):
    add(110, f'trigger {r["relname"]}.{r["tgname"]}', sanitize(r['def']))
    # estado do gatilho (ligado/desligado)

for r in q("""select c.relname, t.tgname, t.tgenabled::text en from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal and c.relnamespace = 'public'::regnamespace and t.tgenabled <> 'O'"""):
    mode = {'D': 'DISABLE', 'A': 'ENABLE ALWAYS', 'R': 'ENABLE REPLICA'}.get(r['en'])
    if mode:
        add(111, f'trigger state {r["tgname"]}', f'ALTER TABLE public.{ident(r["relname"])} {mode} TRIGGER {ident(r["tgname"])}')

# ---------------------------------------------------------------- 11. RLS e políticas
for t in tables:
    if t['rls']:
        add(120, 'rls ' + t['relname'], f'ALTER TABLE public.{ident(t["relname"])} ENABLE ROW LEVEL SECURITY')
    if t['frls']:
        add(120, 'force rls ' + t['relname'], f'ALTER TABLE public.{ident(t["relname"])} FORCE ROW LEVEL SECURITY')

policies = q("""select n.nspname sch, c.relname, p.polname, p.polcmd::text cmd, p.polpermissive perm,
    coalesce((select string_agg(case when r = 0 then 'public' else quote_ident(pg_get_userbyid(r)) end, ', ') from unnest(p.polroles) r), 'public') roles,
    pg_get_expr(p.polqual, p.polrelid) qual, pg_get_expr(p.polwithcheck, p.polrelid) wc
    from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
    where (n.nspname = 'public') or (n.nspname = 'storage' and c.relname = 'objects') order by n.nspname, c.relname, p.polname""")
for p in policies:
    cmd = {'r': 'SELECT', 'a': 'INSERT', 'w': 'UPDATE', 'd': 'DELETE', '*': 'ALL'}[p['cmd']]
    sql = f'CREATE POLICY {ident(p["polname"])} ON {p["sch"]}.{ident(p["relname"])} AS {"PERMISSIVE" if p["perm"] else "RESTRICTIVE"} FOR {cmd} TO {p["roles"]}'
    if p['qual']:
        sql += f' USING ({p["qual"]})'
    if p['wc']:
        sql += f' WITH CHECK ({p["wc"]})'
    add(121, f'policy {p["relname"]}.{p["polname"]}', sql)

# ---------------------------------------------------------------- 12. grants (só os papéis da API)
ROLES = ('anon', 'authenticated', 'service_role')
for t in q("""select c.relname, c.relkind::text kind, coalesce(c.relacl::text, '') acl from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v')
    and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') order by 1"""):
    kind = 'TABLE'
    add(130, f'revoke {t["relname"]}', f'REVOKE ALL ON {kind} public.{ident(t["relname"])} FROM anon, authenticated, service_role')
for g in q("""select c.relname, a.grantee::regrole::text role, string_agg(a.privilege_type, ', ' order by a.privilege_type) privs
    from pg_class c, lateral aclexplode(c.relacl) a
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v') and a.grantee::regrole::text in ('anon','authenticated','service_role')
    group by 1, 2 order by 1, 2"""):
    add(131, f'grant {g["relname"]} {g["role"]}', f'GRANT {g["privs"]} ON TABLE public.{ident(g["relname"])} TO {g["role"]}')
for g in q("""select c.relname, a.attname, x.grantee::regrole::text role, string_agg(x.privilege_type, ', ' order by x.privilege_type) privs
    from pg_attribute a join pg_class c on c.oid = a.attrelid, lateral aclexplode(a.attacl) x
    where c.relnamespace = 'public'::regnamespace and a.attacl is not null and not a.attisdropped
    and x.grantee::regrole::text in ('anon','authenticated','service_role') group by 1, 2, 3 order by 1, 2, 3"""):
    privs = ', '.join(f'{p.strip()} ({ident(g["attname"])})' for p in g['privs'].split(','))
    add(132, f'column grant {g["relname"]}.{g["attname"]} {g["role"]}', f'GRANT {privs} ON TABLE public.{ident(g["relname"])} TO {g["role"]}')
for f in q("""select p.oid::regprocedure::text sig, p.proacl is not null has_acl from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p') and p.proacl is not null
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') order by 1"""):
    add(133, 'revoke fn ' + f['sig'], f'REVOKE ALL ON FUNCTION {f["sig"]} FROM PUBLIC, anon, authenticated, service_role')
for g in q("""select p.oid::regprocedure::text sig, case when a.grantee = 0 then 'public' else a.grantee::regrole::text end role
    from pg_proc p, lateral aclexplode(p.proacl) a
    where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p') and a.privilege_type = 'EXECUTE'
    and (a.grantee = 0 or a.grantee::regrole::text in ('anon','authenticated','service_role'))
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') order by 1, 2"""):
    add(134, f'grant fn {g["sig"]} {g["role"]}', f'GRANT EXECUTE ON FUNCTION {g["sig"]} TO {g["role"]}')

# ---------------------------------------------------------------- 13. realtime (com lista de colunas)
for r in q("""select p.pubname, pt.tablename, pt.attnames::text[] attnames from pg_publication_tables pt join pg_publication p on p.pubname = pt.pubname
    where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public' order by pt.tablename"""):
    colspec = ''
    if r['attnames']:
        colspec = ' (' + ', '.join(ident(a) for a in (json.loads(r['attnames']) if isinstance(r['attnames'], str) else r['attnames'])) + ')'
    add(140, 'realtime ' + r['tablename'], f'ALTER PUBLICATION supabase_realtime ADD TABLE public.{ident(r["tablename"])}{colspec}')

# ---------------------------------------------------------------- 14. storage (buckets; as políticas de storage.objects já entraram acima)
for b in q("select id, name, public, file_size_limit, allowed_mime_types::text[] mimes from storage.buckets order by id"):
    mimes = 'NULL' if not b['mimes'] else "ARRAY[" + ', '.join("'" + m.replace("'", "''") + "'" for m in (json.loads(b['mimes']) if isinstance(b['mimes'], str) else b['mimes'])) + "]"
    limit = 'NULL' if b['file_size_limit'] is None else str(b['file_size_limit'])
    add(150, 'bucket ' + b['id'], f"INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('{b['id']}', '{b['name']}', {'true' if b['public'] else 'false'}, {limit}, {mimes}) ON CONFLICT (id) DO NOTHING")

# ---------------------------------------------------------------- saída
# trava final: nada que pareça segredo pode sair no arquivo (ele vai para o git)
SECRET_PATTERNS = [r'eyJ[A-Za-z0-9_-]{20,}', r'sb_secret_', r'sk_(live|test)_', r'\$aact_', r'x-webhook-secret"\s*:\s*"(?!__STAGING_WEBHOOK_SECRET__)', r'service_role_key']
for phase, desc, sql in stmts:
    for pat in SECRET_PATTERNS:
        if re.search(pat, sql):
            sys.exit(f'ABORTADO: possível segredo no comando "{desc}" (padrão {pat}). Ajuste sanitize() antes de gerar o baseline.')

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w') as f:
    f.write('-- ESQUEMA-BASE do iUser (sem dados). GERADO por scripts/staging/export-baseline.py a partir da produção (só leitura).\n')
    f.write('-- Não edite à mão: rode o script de novo. Cada bloco "-- @@ fase|descrição" é um comando; o aplicador repete os que falham por ordem de dependência.\n\n')
    for phase, desc, sql in sorted(stmts, key=lambda s: s[0]):
        f.write(f'-- @@ {phase}|{desc}\n{sql}\n\n')
print(f'{len(stmts)} comandos -> {os.path.relpath(OUT, ROOT)}')
