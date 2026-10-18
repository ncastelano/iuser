#!/usr/bin/env python3
# Compara o ESQUEMA da produção com o do staging (só leitura nos dois): contagens e diferenças por objeto.
#   python3 scripts/staging/compare.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import q_prod, q_staging

CHECKS = {
    'tabelas': "select relname k, '' v from pg_class where relnamespace='public'::regnamespace and relkind='r' and not exists (select 1 from pg_depend d where d.objid=oid and d.deptype='e')",
    'colunas': "select c.relname||'.'||a.attname k, format_type(a.atttypid,a.atttypmod)||case when a.attnotnull then ' NN' else '' end v from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and c.relkind='r' and a.attnum>0 and not a.attisdropped and not exists (select 1 from pg_depend d where d.objid=c.oid and d.deptype='e')",
    'views': "select relname k, md5(pg_get_viewdef(oid,true)) v from pg_class where relnamespace='public'::regnamespace and relkind='v' and not exists (select 1 from pg_depend d where d.objid=oid and d.deptype='e')",
    'funcoes': "select p.oid::regprocedure::text k, md5(regexp_replace(pg_get_functiondef(p.oid), 'https?://[^ '']*iuser\\.com\\.br|staging\\.invalid|https?://[a-z0-9.-]*vercel\\.app', 'URL', 'g')) v from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind in ('f','p') and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')",
    'gatilhos': "select c.relname||'.'||t.tgname k, '' v from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace='public'::regnamespace",
    'politicas': "select tablename||'.'||policyname k, md5(coalesce(qual,'')||'|'||coalesce(with_check,'')||'|'||cmd||'|'||roles::text) v from pg_policies where schemaname='public'",
    'grants de tabela': "select c.relname||':'||a.grantee::regrole::text k, string_agg(a.privilege_type, ',' order by a.privilege_type) v from pg_class c, lateral aclexplode(c.relacl) a where c.relnamespace='public'::regnamespace and c.relkind in ('r','v') and a.grantee::regrole::text in ('anon','authenticated','service_role') group by 1",
    'grants de coluna': "select c.relname||'.'||a.attname||':'||x.grantee::regrole::text k, string_agg(x.privilege_type, ',' order by x.privilege_type) v from pg_attribute a join pg_class c on c.oid=a.attrelid, lateral aclexplode(a.attacl) x where c.relnamespace='public'::regnamespace and a.attacl is not null and x.grantee::regrole::text in ('anon','authenticated','service_role') group by 1",
    'realtime': "select tablename k, coalesce(attnames::text,'') v from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'",
    'buckets': "select id k, public::text v from storage.buckets",
}
bad = 0
for name, sql in CHECKS.items():
    a = {r['k']: r['v'] for r in q_prod(sql)}
    b = {r['k']: r['v'] for r in q_staging(sql)}
    only_a, only_b = sorted(set(a) - set(b)), sorted(set(b) - set(a))
    diff = sorted(k for k in set(a) & set(b) if a[k] != b[k])
    status = 'OK ' if not (only_a or only_b or diff) else 'DIF'
    bad += status == 'DIF'
    print(f'{status} {name}: produção={len(a)} staging={len(b)}')
    for label, lst in (('só na produção', only_a), ('só no staging', only_b), ('diferentes', diff)):
        for k in lst[:15]:
            print(f'      {label}: {k}')
        if len(lst) > 15:
            print(f'      ... e mais {len(lst) - 15}')
sys.exit(1 if bad else 0)
