# Rede de teste do @admin-teste no banco LOCAL (Docker/OrbStack): pessoas fictícias abaixo dele, UMA de cada hierarquia
# (Usuário, Líder, Supervisor, Gestor, Administrador) e mais gente nos níveis de baixo, com ações que dão pontos (convite,
# seguir, publicar, serviço) para ver os detalhes da rede / graduação / pontuação. Idempotente. Só escreve no banco local.
# Uso: python3 scripts/local/seed-network.py
import json, os, random, sys, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import q_local, status_env

env = status_env()
API, KEY = env['API_URL'].rstrip('/'), env['SERVICE_ROLE_KEY']
if 'supabase.co' in API:
    sys.exit('RECUSADO: isto só roda no banco LOCAL.')
PASSWORD = 'Teste-local-123'
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}


def api(method, path, body=None, extra=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers={**H, **(extra or {})})
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read().decode()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{method} {path} -> {e.code} {e.read().decode()[:300]}')


def ensure_user(email, name):
    users = api('GET', '/auth/v1/admin/users?per_page=500')['users']
    for u in users:
        if u['email'] == email:
            return u['id']
    return api('POST', '/auth/v1/admin/users', {'email': email, 'password': PASSWORD, 'email_confirm': True, 'user_metadata': {'name': name}})['id']


admin = q_local('''select id from profiles where "profileSlug"='admin-teste' ''')[0]['id']
status = {r['slug']: r['id'] for r in q_local('select id, slug from user_statuses')}

# slug, nome, hierarquia, quem convidou (None = o admin)
PEOPLE = [
    ('rede-ana-usuaria',      'Ana Usuária',         'usuario',       None),
    ('rede-bruno-lider',      'Bruno Líder',         'lider',         None),
    ('rede-carla-supervisora', 'Carla Supervisora',  'supervisor',    None),
    ('rede-diego-gestor',     'Diego Gestor',        'gestor',        None),
    ('rede-eva-administradora', 'Eva Administradora', 'administrador', None),
    # segundo nível (convidados dos de cima)
    ('rede-fabio-convidado',  'Fábio Convidado',     'usuario',       'rede-bruno-lider'),
    ('rede-gabi-convidada',   'Gabi Convidada',      'lider',         'rede-bruno-lider'),
    ('rede-hugo-convidado',   'Hugo Convidado',      'usuario',       'rede-carla-supervisora'),
    ('rede-iara-convidada',   'Iara Convidada',      'supervisor',    'rede-diego-gestor'),
    # terceiro nível
    ('rede-joao-neto',        'João Neto',           'usuario',       'rede-fabio-convidado'),
    ('rede-lia-neta',         'Lia Neta',            'usuario',       'rede-gabi-convidada'),
]

ids = {}
for slug, name, _, _ in PEOPLE:
    ids[slug] = ensure_user(f'{slug}@staging.iuser.test', name)

# perfis: o convite (upline_id) entra na criação para o gatilho dar os pontos de "Convidar alguém"
existing = {r['profileSlug'] for r in q_local('select "profileSlug" from profiles')}
for slug, name, st, up in PEOPLE:
    upline = admin if up is None else ids[up]
    row = {'id': ids[slug], 'name': name, 'profileSlug': slug, 'email': f'{slug}@staging.iuser.test', 'is_active': True, 'upline_id': upline, 'status_id': status[st]}
    api('POST', '/rest/v1/profiles?on_conflict=id', [row], {'Prefer': 'resolution=merge-duplicates,return=minimal'})
# garante o vínculo e a hierarquia mesmo se o perfil já existia
for slug, name, st, up in PEOPLE:
    upline = admin if up is None else ids[up]
    q_local(f"update profiles set upline_id='{upline}', status_id='{status[st]}' where id='{ids[slug]}' and (upline_id is distinct from '{upline}' or status_id is distinct from '{status[st]}')")

# ações que dão pontos (os gatilhos do banco pontuam; aqui só se fazem as ações)
random.seed(7)
everyone = list(ids.values())
follows = []
for slug in ids:
    me = ids[slug]
    targets = [admin] + random.sample([x for x in everyone if x != me], k=random.randint(2, 6))
    follows += [{'follower_id': me, 'following_id': t} for t in targets]
# o admin também segue alguns deles
follows += [{'follower_id': admin, 'following_id': ids[s]} for s in list(ids)[:5]]
api('POST', '/rest/v1/follows?on_conflict=follower_id,following_id', follows, {'Prefer': 'resolution=ignore-duplicates,return=minimal'})

posts = [
    ('rede-bruno-lider', 'publication', 3), ('rede-carla-supervisora', 'publication', 2), ('rede-diego-gestor', 'publication', 4),
    ('rede-eva-administradora', 'publication', 5), ('rede-gabi-convidada', 'publication', 1), ('rede-iara-convidada', 'publication', 2),
    ('rede-bruno-lider', 'service_offer', 2), ('rede-diego-gestor', 'service_offer', 1), ('rede-eva-administradora', 'service_offer', 3),
    ('rede-ana-usuaria', 'service_offer', 1),
]
rows = []
for slug, kind, n in posts:
    for i in range(n):
        base = f'{slug}-{kind}-{i+1}'
        title = ('Novidade da semana' if kind == 'publication' else 'Atendimento especializado') + f' {i+1}'
        rows.append({'name': title, 'slug': base, 'description': 'Conteúdo de teste da rede.', 'price': 0, 'type': 'physical' if kind == 'publication' else 'service',
                     'price_type': 'fixed', 'listing_type': kind, 'owner_id': ids[slug], 'store_id': None, 'is_active': True, 'view_count': random.randint(5, 300)})
have = {r['slug'] for r in q_local("select slug from products where slug like 'rede-%'")}
rows = [r for r in rows if r['slug'] not in have]
if rows:
    api('POST', '/rest/v1/products', rows, {'Prefer': 'return=minimal'})

# planos ativos e comissões (a comissão de quem indicou sai da função do banco, a partir do valor realmente pago)
PLANS = {
    'rede-ana-usuaria': 'Prestador de serviço', 'rede-bruno-lider': 'Loja', 'rede-carla-supervisora': 'Combo (loja + motorista + prestador + recrutador)',
    'rede-diego-gestor': 'Pré-pago', 'rede-eva-administradora': 'Motorista', 'rede-fabio-convidado': 'Loja', 'rede-gabi-convidada': 'Prestador de serviço',
    'rede-iara-convidada': 'Pré-pago',
}
plan_by_name = {r['name']: r for r in q_local('select id, name, price from plans')}
for slug, plan_name in PLANS.items():
    plan = plan_by_name[plan_name]
    uid = ids[slug]
    sub = q_local(f"select id from subscriptions where user_id='{uid}' and plan_id='{plan['id']}' and status='active' limit 1")
    if sub:
        sub_id = sub[0]['id']
    else:
        q_local(f"insert into subscriptions (user_id, plan_id, status, current_period_end) values ('{uid}', '{plan['id']}', 'active', now() + interval '25 days')")
        sub_id = q_local(f"select id from subscriptions where user_id='{uid}' and plan_id='{plan['id']}' and status='active' order by created_at desc limit 1")[0]['id']
    cents = int(round(float(plan['price']) * 100))
    if cents > 0:
        try:
            q_local(f"select public.record_referral_commission('{uid}', 'prepaid', {cents}, 'seed-rede-{slug}', '{sub_id}', '{plan['id']}')")
        except RuntimeError as e:
            print('  (comissão de', slug, 'não registrada:', str(e)[:120], ')')

print('Rede criada para @admin-teste:')
for r in q_local('''select p."profileSlug" slug, s.name hierarquia, coalesce(pp.total,0) pontos, p.upline_id is not null convidado
                    from profiles p left join user_statuses s on s.id=p.status_id left join profile_points pp on pp.profile_id=p.id
                    where p."profileSlug" like 'rede-%' order by 3 desc'''):
    print(f"  {r['slug']:<26} {r['hierarquia']:<14} {r['pontos']} pts")
a = q_local(f'''select downline_count, total_network, level from profiles where id='{admin}' ''')[0]
print('admin-teste:', a)
