#!/usr/bin/env python3
"""Cenários do banco para a MODERAÇÃO (migration 20261130000013): denunciar, ocultar de verdade (políticas de leitura, feed, publicação), avisar o autor e o admin decidir — só LOCAL.
Transação DESFEITA no fim.
  python3 scripts/local/test-moderation.py
"""
import json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import DB, DOCKER, ENV, q_local  # noqa: E402


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"





def one(sql): return q_local(sql)[0]
F = one("select id, author_id from flashes order by created_at desc limit 1")
FC = one(f"select id, author_id from flash_comments where author_id <> '{F['author_id']}' order by created_at desc limit 1")
C = one("select id, profile_id as author_id from comments order by created_at desc limit 1")
R = one("select id, profile_id as author_id from product_reviews where profile_id is not null order by created_at desc limit 1")
M = one("select m.id, m.profile_id as author_id from community_messages m join communities c on c.id = m.community_id where not c.requires_password order by m.created_at desc limit 1")
P = one("select id, owner_id as author_id from products where listing_type = 'publication' and is_active order by created_at desc limit 1")
F2 = one(f"select id, author_id from flashes where id <> '{F['id']}' order by created_at desc limit 1")
authors = {t['author_id'] for t in (F, FC, C, R, M, P, F2)}
reps = [r['id'] for r in q_local("select u.id from auth.users u where u.email like 'cliente-%@staging.iuser.test' order by u.email limit 12") if r['id'] not in authors][:5]
ADM = reps[4]
RP = reps[:4]
def j(x): return esc(x['id']) + '::uuid'

def as_role(uid):
    claims = json.dumps({'sub': uid, 'role': 'authenticated'})
    return f"perform set_config('request.jwt.claim.sub', {esc(uid)}, true); perform set_config('request.jwt.claims', {esc(claims)}, true); execute 'set local role authenticated';"


def case(name, uid, body, expect):
    """expect = 'ok' ou um trecho do HINT/mensagem do erro esperado. Cada caso roda num sub-bloco, como a pessoa (papel authenticated), e volta ao papel normal."""
    return f"""
do $$ declare v_msg text; v_hint text; v_res text;
begin
  {as_role(uid) if uid else ''}
  begin
    {body}
    v_res := 'ok';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    v_res := 'erro: ' || coalesce(v_hint, '') || ' | ' || coalesce(v_msg, '');
  end;
  execute 'reset role';
  raise notice 'CASE§{name}§%§{expect}', v_res;
end $$;
"""




sql = f"""begin;
update profiles set created_at = now() - interval '10 days' where id in ({','.join(esc(r) + '::uuid' for r in RP)});
delete from content_reports where reporter_id in ({','.join(esc(r) + '::uuid' for r in RP)});
delete from content_moderation where target_id in ({j(F)}, {j(FC)}, {j(C)}, {j(R)}, {j(M)}, {j(P)}, {j(F2)});
"""
def report(who, t, x, reason='spam'):
    return f"perform report_content('{t}', {j(x)}, '{reason}', 'teste');"
def expect_res(res):
    return lambda: None
def rep_case(name, who, t, x, want):
    return case(name, who, f"if report_content('{t}', {j(x)}, 'spam', 'teste') is distinct from '{want}' then raise exception 'esperava {want}'; end if;", 'ok')
def count_as(name, who, table, x, n, role=None):
    body = (f"execute 'reset role'; execute 'set local role {role}';" if role else '') + f" if (select count(*) from {table} where id = {j(x)}) <> {n} then raise exception 'esperava {n} linha(s)'; end if;"
    return case(name, who, body, 'ok')

# --- FLASH: o ciclo completo
sql += case('1 tipo inválido é recusado', RP[0], f"perform report_content('xyz', {j(F)}, 'spam');", 'Tipo inválido')
sql += case('2 motivo inválido é recusado', RP[0], f"perform report_content('flash', {j(F)}, 'xyz');", 'Motivo inválido')
sql += case('3 o autor não denuncia o que é dele', F['author_id'], f"perform report_content('flash', {j(F)}, 'spam');", 'não pode denunciar')
sql += case('4 conteúdo que não existe', RP[0], "perform report_content('flash', gen_random_uuid(), 'spam');", 'não encontrado')
sql += rep_case('5 1ª denúncia', RP[0], 'flash', F, 'reported')
sql += rep_case('6 a mesma pessoa de novo não conta', RP[0], 'flash', F, 'already')
sql += rep_case('7 2ª pessoa', RP[1], 'flash', F, 'reported')
sql += count_as('8 com 2 denúncias ainda aparece', RP[3], 'flashes', F, 1)
sql += rep_case('9 3ª pessoa OCULTA', RP[2], 'flash', F, 'hidden')
sql += count_as('10 oculto some para outra pessoa', RP[3], 'flashes', F, 0)
sql += count_as('11 oculto some para visitante', None, 'flashes', F, 0, role='anon')
sql += case('12 oculto some do feed', RP[3], f"if exists (select 1 from get_flash_feed('all', 50) f where f.id = {j(F)}) then raise exception 'ainda no feed'; end if;", 'ok')
sql += case('13 o autor é avisado', F['author_id'], "if not exists (select 1 from profile_notifications where profile_id = auth.uid() and kind = 'moderation_update' and created_at > now() - interval '1 minute') then raise exception 'sem aviso'; end if;", 'ok')
sql += f"select admin_moderate('flash', {j(F)}, 'clear', 'Está tudo certo', {esc(ADM)}::uuid);\n"
sql += count_as('14 o admin MANTÉM: volta a aparecer', RP[3], 'flashes', F, 1)
sql += rep_case('15 depois de mantido, nova denúncia não oculta de novo', RP[3], 'flash', F, 'reported')
sql += f"select admin_moderate('flash', {j(F)}, 'hide', 'Ofensivo', {esc(ADM)}::uuid);\n"
sql += count_as('16 o admin OCULTA por conta própria', RP[3], 'flashes', F, 0)
sql += f"select admin_moderate('flash', {j(F)}, 'restore', null, {esc(ADM)}::uuid);\n"
sql += count_as('17 o admin RESTAURA', RP[3], 'flashes', F, 1)
# --- os outros tipos
for t, x, tbl, nm in (('flash_comment', FC, 'flash_comments', 'comentário do flash'), ('comment', C, 'comments', 'comentário'), ('product_review', R, 'product_reviews', 'avaliação'), ('community_message', M, 'community_messages', 'mensagem da comunidade')):
    sql += f"select admin_moderate('{t}', {j(x)}, 'restore', null, {esc(ADM)}::uuid);\n"
    sql += rep_case(f'18 {nm}: 1ª', RP[0], t, x, 'reported')
    sql += rep_case(f'18 {nm}: 2ª', RP[1], t, x, 'reported')
    sql += rep_case(f'18 {nm}: 3ª oculta', RP[2], t, x, 'hidden')
    sql += count_as(f'19 {nm} oculta(o) some da leitura', RP[3], tbl, x, 0)
    sql += f"select admin_moderate('{t}', {j(x)}, 'restore', null, {esc(ADM)}::uuid);\n"
    sql += count_as(f'20 {nm} restaurado(a) volta', RP[3], tbl, x, 1)
# --- publicação: some pelo is_active e volta
sql += f"select admin_moderate('publication', {j(P)}, 'restore', null, {esc(ADM)}::uuid);\n"
sql += rep_case('21 publicação: 1ª', RP[0], 'publication', P, 'reported')
sql += rep_case('21 publicação: 2ª', RP[1], 'publication', P, 'reported')
sql += rep_case('21 publicação: 3ª oculta', RP[2], 'publication', P, 'hidden')
sql += case('22 publicação oculta fica inativa (some do feed)', None, f"if (select is_active from products where id = {j(P)}) then raise exception 'ainda ativa'; end if;", 'ok')
sql += f"select admin_moderate('publication', {j(P)}, 'restore', null, {esc(ADM)}::uuid);\n"
sql += case('23 restaurada, volta a ficar ativa', None, f"if not (select is_active from products where id = {j(P)}) then raise exception 'continua inativa'; end if;", 'ok')
# --- proteções
sql += f"update profiles set created_at = now() where id in ({','.join(esc(r) + '::uuid' for r in RP[:3])});\n"
sql += rep_case('24 conta nova (< 1 dia) denuncia 1', RP[0], 'flash', F2, 'reported')
sql += rep_case('24 conta nova denuncia 2', RP[1], 'flash', F2, 'reported')
sql += rep_case('24 conta nova denuncia 3: NÃO oculta (contas novas não contam)', RP[2], 'flash', F2, 'reported')
sql += count_as('25 por isso o flash continua visível', RP[3], 'flashes', F2, 1)
sql += f"insert into content_reports (reporter_id, target_type, target_id, reason) select {esc(RP[3])}::uuid, 'flash', gen_random_uuid(), 'spam' from generate_series(1, 20);\n"
sql += case('26 mais de 20 denúncias em 24 h: limite', RP[3], f"perform report_content('flash', {j(F2)}, 'spam');", 'muitas denúncias')
sql += case('27 ninguém lê as tabelas de denúncia direto', RP[3], "perform * from content_reports;", 'permission denied|42501')
sql += "rollback;\n"

if os.environ.get('DUMP'):
    open(os.environ['DUMP'], 'w').write(sql); sys.exit(0)
p = subprocess.run([DOCKER, 'exec', '-i', DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-At'], input=sql, capture_output=True, text=True, env=ENV)
out = p.stdout + '\n' + p.stderr
if p.returncode != 0 and 'CASE|' not in out:
    print(out[-1500:]); sys.exit(1)
fail = 0
for line in out.splitlines():
    if line.startswith(('DUE|', 'R2STATUS')):
        print('  ·', line)
    if 'CASE§' not in line:
        continue
    name, res, expect = line.split('CASE§', 1)[1].split('§')
    good = (res == 'ok' and expect == 'ok') or (expect != 'ok' and res.startswith('erro') and any(e in res for e in expect.split('|')))
    fail += 0 if good else 1
    print(('✔' if good else '✖'), name, '' if good else f'→ {res}  (esperado: {expect})')
print('\nTUDO CERTO' if fail == 0 else f'\n{fail} FALHA(S)')
sys.exit(1 if fail else 0)
