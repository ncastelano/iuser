#!/usr/bin/env python3
"""Simulador do ecossistema iUser — SÓ no Supabase LOCAL (contêiner `supabase_db_iuser-local`, dados descartáveis).

A cada TICK (padrão 10 s), N pessoas (padrão 10) fazem uma coisa aleatória, cada uma COMO ELA MESMA (papel `authenticated` + JWT da pessoa,
então RLS, gatilhos e RPCs do app valem de verdade): comprar numa loja, agendar um serviço, comentar numa publicação, falar numa comunidade,
avaliar o que comprou, publicar um serviço ou uma publicação, seguir e curtir. Em paralelo, o "relógio" do ecossistema:
  - as lojas aceitam e concluem os pedidos; os donos confirmam e concluem os agendamentos (a pessoa "foi ao local");
  - PEDIDOS DE MOTORISTA: mantém `--rides` pessoas (padrão 20) com corrida ativa o tempo todo; motoristas se candidatam, o passageiro escolhe
    um, o motorista vai até a partida, chega, inicia, conclui (a posição vai ao destino, < 100 m) e os dois se avaliam;
  - as posições ao vivo dos motoristas são renovadas (não precisa do seed-drivers --loop).
Cada tick imprime uma linha de CRESCIMENTO (totais e o que mudou) e grava em ~/Desktop/simulacao-ecossistema/crescimento.csv.

  python3 scripts/local/simulate-ecosystem.py                    # roda até Ctrl-C
  python3 scripts/local/simulate-ecosystem.py --ticks 6          # só 6 ticks
  python3 scripts/local/simulate-ecosystem.py --once buy         # uma ação só (teste): buy|schedule|comment|community|review|publish|follow
  python3 scripts/local/simulate-ecosystem.py --stats            # só mostra os totais agora
"""
import argparse, csv, json, math, os, random, sys, threading, time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import psql, q_local  # noqa: E402

OUT_DIR = os.path.expanduser('~/Desktop/simulacao-ecossistema')
LOCK = threading.Lock()
R = random.Random()


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"


def as_user(uid, sql):
    """Executa `sql` como a pessoa `uid` (authenticated + JWT), numa transação."""
    claims = json.dumps({'sub': uid, 'role': 'authenticated'})
    script = f"begin;\nselect set_config('request.jwt.claim.sub', {esc(uid)}, true), set_config('request.jwt.claims', {esc(claims)}, true);\nset local role authenticated;\n{sql}\ncommit;\n"
    return psql(['-At'], stdin=script)


def last_line(out):
    lines = [l for l in out.strip().splitlines() if l.strip() and l.strip() not in ('BEGIN', 'COMMIT', 'SET')]
    return lines[-1] if lines else ''


def log(msg):
    with LOCK:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# ---------------------------------------------------------------- textos
COMMENTS = ['Muito bom, recomendo!', 'Adorei o resultado', 'Quanto custa?', 'Chegou rapidinho, top', 'Qualidade excelente', 'Já pedi aqui e gostei muito', 'Quero experimentar!',
            'Parabéns pelo trabalho', 'Show de bola', 'Alguém já testou?', 'Ficou lindo demais', 'Vocês entregam no meu bairro?', 'Melhor da cidade, sem dúvida', 'Amei o atendimento']
REPLIES = ['Concordo!', 'Também achei', 'Verdade', 'Vou conferir', 'Obrigado pela dica', 'Boa!', 'Passa o contato?', 'Sim, entrega sim']
CHAT = ['Bom dia pessoal!', 'Alguém sabe onde achar uma boa padaria por aqui?', 'Recomendo muito a loja do centro', 'Hoje o trânsito tá pesado', 'Quem vai no evento do fim de semana?',
        'Fechei um serviço pelo iUser hoje, muito prático', 'Consegui um motorista em 2 minutos', 'Alguém indica um bom eletricista?', 'Valeu pela dica, galera', 'Fiz um pedido agora e já chegou',
        'Tem promoção rolando?', 'Gostei muito do atendimento de hoje']
REVIEWS = ['Produto muito bom, chegou certinho.', 'Atendimento excelente!', 'Superou as expectativas.', 'Bom custo-benefício.', 'Voltarei a comprar.', 'Demorou um pouco, mas valeu a pena.', 'Ótima qualidade.', '']
RIDE_COMMENTS = ['Motorista pontual e educado', 'Carro limpo e viagem tranquila', 'Dirige com cuidado, recomendo', 'Chegou rápido', 'Corrida ótima', '', '', 'Muito simpático']
PASSENGER_COMMENTS = ['Passageiro pontual', 'Tudo certo, obrigado', '', '']
SERVICE_NAMES = ['Aula particular de violão', 'Manicure e pedicure em casa', 'Reparo de ar-condicionado', 'Personal trainer', 'Fotografia de eventos', 'Limpeza residencial', 'Pintura de paredes', 'Banho e tosa a domicílio', 'Conserto de celular', 'Marmitas fit sob encomenda']
PUB_TEXTS = ['Novidade chegando essa semana!', 'Bastidores do nosso trabalho de hoje', 'Resultado de um cliente satisfeito', 'Promoção só até sexta', 'Olha o que preparamos pra vocês', 'Agenda aberta para a próxima semana']

# (rua ou lugar, lat, lng, bairro): o endereço sai como "Rua, nº, Bairro, Porto Velho - RO", como o geocoder devolve; a oferta pública mostra só o bairro
POINTS = [
    ('Av. Sete de Setembro', -8.7625, -63.9030, 'Centro'), ('Rua Dom Pedro II', -8.7640, -63.9050, 'Centro'), ('Av. Presidente Dutra', -8.7635, -63.9035, 'Olaria'),
    ('Av. Carlos Gomes', -8.7630, -63.9060, 'São Cristóvão'), ('Av. Farquar', -8.7600, -63.9000, 'Pedrinhas'), ('Av. Jorge Teixeira', -8.7480, -63.8900, 'Industrial'),
    ('Shopping Porto Velho', -8.7550, -63.9300, 'Embratel'), ('Rodoviária', -8.7700, -63.9100, 'Nova Porto Velho'), ('Rua Júlio de Castilho', -8.7650, -63.9020, 'Arigolândia'),
    ('Av. Campos Sales', -8.7610, -63.9080, 'Liberdade'), ('Mercado Cultural', -8.7655, -63.9045, 'Caiari'), ('Av. Calama', -8.7510, -63.9150, 'Mato Grosso'),
]
LANDMARKS = {'Shopping Porto Velho', 'Rodoviária', 'Mercado Cultural'}


def point_address(pt):
    street, bairro = pt[0], pt[3]
    num = '' if street in LANDMARKS else '%d, ' % R.randint(50, 900)
    return '%s, %s%s, Porto Velho - RO' % (street, num, bairro)


def hav(a, b, c, d):
    p1, p2 = math.radians(a), math.radians(c)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(d - b) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


# ---------------------------------------------------------------- dados (recarregados de tempos em tempos)
class Pool:
    def load(self):
        self.customers = q_local("select p.id, p.\"profileSlug\" as slug, p.name from profiles p join auth.users u on u.id = p.id where u.email like 'cliente-%@staging.iuser.test' and p.id not in (" + RESERVED_SQL + ")")
        self.owners = q_local("select p.id, p.\"profileSlug\" as slug, p.name from profiles p join auth.users u on u.id = p.id where u.email like 'owner-%@staging.iuser.test'")
        self.stores = q_local("select id, \"storeSlug\" as slug, name, owner_id, logo_url, coalesce(accepts_pickup, true) as pickup, coalesce(accepts_delivery, false) as delivery from stores where is_active and coalesce(deposit_mode,'none') = 'none'")
        self.goods = q_local("select id, store_id, name, price from products where is_active and type = 'physical' and listing_type = 'sale' and store_id is not null and price > 0")
        self.services = q_local("select id, store_id, name, price, coalesce(duration_minutes, 60) as dur from products where is_active and type = 'service' and listing_type = 'sale' and store_id is not null")
        self.pubs = q_local("select id, owner_id, store_id from products where is_active and listing_type = 'publication'")
        self.comms = q_local("select c.id, c.slug, array_agg(m.profile_id) as members from communities c join community_members m on m.community_id = c.id group by c.id, c.slug")
        self.drivers = q_local(f"select dp.driver_id as id, p.\"profileSlug\" as slug, p.name from driver_pricing dp join profiles p on p.id = dp.driver_id where dp.driver_mode_active and dp.driver_id not in ({RESERVED_SQL})")
        self.people = self.customers + self.owners
        self.by_store = {s['id']: s for s in self.stores}


POOL = Pool()
# Contas reservadas para a pessoa mexer na mão no navegador (Ana Silva e Felipe Costa): o simulador não age por elas
RESERVED = ('28e08603-96b0-49fc-867e-efc3d8e7d63b', 'e72ff0cd-7a15-4177-b615-a035d3ef569c')
RESERVED_SQL = ','.join(f"'{x}'" for x in RESERVED)
STATE = {'appt_age': {}, 'ride_tick': {}}


# ---------------------------------------------------------------- ações das pessoas
def act_buy(p):
    s = R.choice(POOL.stores)
    goods = [g for g in POOL.goods if g['store_id'] == s['id']]
    if not goods:
        return 'sem produtos'
    items = [{'product_id': g['id'], 'quantity': R.randint(1, 3), 'comment': None, 'addons': []} for g in R.sample(goods, min(len(goods), R.randint(1, 3)))]
    deliver = (not s['pickup']) and s['delivery']
    addr = f"Rua das Palmeiras, {R.randint(100, 900)}, Porto Velho - RO" if deliver else None
    out = as_user(p['id'], f"select create_store_order({esc(s['id'])}::uuid, {esc(json.dumps(items))}::jsonb, {esc('entrega' if deliver else 'retirada')}, {esc(R.choice(['pix', 'pix', 'cartao', 'dinheiro']))}, "
                          f"{esc(addr) if addr else 'null'}, null, null, null, null, null, gen_random_uuid());")
    d = json.loads(last_line(out))
    return f"comprou {len(items)} item(ns) em {s['name']} — R$ {float(d['total_amount']):.2f}".replace('.', ',')


def act_schedule(p):
    svcs = [x for x in POOL.services if x['store_id'] in POOL.by_store]
    svc = R.choice(svcs)
    s = POOL.by_store[svc['store_id']]
    day = (datetime.now() + timedelta(days=R.randint(0, 4))).date()
    hour, minute = R.randint(8, 17), R.choice([0, 30])
    items = json.dumps([{'product_id': svc['id'], 'quantity': 1}])
    as_user(p['id'], f"""insert into appointments (store_id, store_slug, store_name, store_logo_url, customer_id, customer_slug, owner_id, owner_slug, provider_profile_id, date, time, duration_minutes,
        service_name, service_type, people_count, status, direction, is_public, service_items)
        select {esc(s['id'])}::uuid, {esc(s['slug'])}, {esc(s['name'])}, {esc(s['logo_url'] or '')}, {esc(p['id'])}::uuid, {esc(p['slug'])}, {esc(s['owner_id'])}::uuid,
               {esc(s['slug'])}, {esc(s['owner_id'])}::uuid, {esc(str(day))}::date, {esc('%02d:%02d:00' % (hour, minute))}::time, {svc['dur']},
               {esc(svc['name'])}, 'service', 1, 'pending', 'outgoing', false, {esc(items)}::jsonb;""")
    return f"agendou {svc['name']} em {s['name']} ({day.strftime('%d/%m')} {hour:02d}:{minute:02d})"


def act_comment(p):
    pub = R.choice(POOL.pubs)
    parent = None
    if R.random() < 0.3:
        row = q_local(f"select id from comments where publication_id = {esc(pub['id'])}::uuid order by random() limit 1")
        parent = row[0]['id'] if row else None
    text = R.choice(REPLIES if parent else COMMENTS)
    as_user(p['id'], f"""insert into comments (content, profile_id, comment_type, publication_id, parent_comment_id)
        values ({esc(text)}, {esc(p['id'])}::uuid, 'publication', {esc(pub['id'])}::uuid, {esc(parent) + '::uuid' if parent else 'null'});
        insert into likes (profile_id, publication_id) values ({esc(p['id'])}::uuid, {esc(pub['id'])}::uuid) on conflict do nothing;""")
    return f"{'respondeu' if parent else 'comentou'} numa publicação: “{text}”"


def act_community(p):
    c = R.choice(POOL.comms)
    as_user(p['id'], f"""insert into community_members (community_id, profile_id) select {esc(c['id'])}::uuid, {esc(p['id'])}::uuid
        where not exists (select 1 from community_members where community_id = {esc(c['id'])}::uuid and profile_id = {esc(p['id'])}::uuid);
        insert into community_messages (community_id, profile_id, content) values ({esc(c['id'])}::uuid, {esc(p['id'])}::uuid, {esc(R.choice(CHAT))});""")
    return f"falou na comunidade {c['slug']}"


def act_review(p):
    rows = q_local(f"""select o.id as order_id, o.store_id, oi.product_id from orders o join order_items oi on oi.order_id = o.id
        where o.buyer_id = {esc(p['id'])}::uuid and o.status = 'paid' and not exists (select 1 from product_reviews r where r.order_id = o.id and r.profile_id = o.buyer_id) limit 1""")
    if not rows:
        # ninguém com pedido pago esperando avaliação: pega alguém que tenha
        rows = q_local("""select o.buyer_id, o.id as order_id, o.store_id, oi.product_id from orders o join order_items oi on oi.order_id = o.id
            where o.status = 'paid' and o.buyer_id is not null and not exists (select 1 from product_reviews r where r.order_id = o.id and r.profile_id = o.buyer_id) order by random() limit 1""")
        if not rows:
            return 'sem pedido pago para avaliar'
        p = {'id': rows[0]['buyer_id'], 'name': 'um comprador'}
    r = rows[0]
    rating = R.choices([5, 4, 3, 2], [55, 28, 12, 5])[0]
    as_user(p['id'], f"""insert into product_reviews (store_id, product_id, profile_id, order_id, rating, comment, is_anonymous)
        values ({esc(r['store_id'])}::uuid, {esc(r['product_id'])}::uuid, {esc(p['id'])}::uuid, {esc(r['order_id'])}::uuid, {rating}, {esc(R.choice(REVIEWS)) if R.random() < 0.7 else 'null'}, false);""")
    return f"avaliou uma compra com {rating}★"


def act_publish(p):
    o = R.choice(POOL.owners)
    slug = 'sim-' + ''.join(R.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
    lat, lng = R.choice(POINTS)[1:3]
    if R.random() < 0.5:
        name = R.choice(SERVICE_NAMES)
        as_user(o['id'], f"""insert into products (name, slug, description, price, type, is_active, owner_id, listing_type, service_type, lat, lng, duration_minutes)
            values ({esc(name)}, {esc(slug)}, {esc('Serviço oferecido por ' + o['name'])}, 0, 'service', true, {esc(o['id'])}::uuid, 'service_offer', {esc(name)}, {lat}, {lng}, 60);""")
        return f"{o['name']} publicou o serviço “{name}”"
    st = next((s for s in POOL.stores if s['owner_id'] == o['id']), None)
    text = R.choice(PUB_TEXTS)
    as_user(o['id'], f"""insert into products (name, slug, description, price, type, is_active, owner_id, store_id, listing_type)
        values ({esc(text)}, {esc(slug)}, {esc(text)}, 0, 'physical', true, {esc(o['id'])}::uuid, {esc(st['id']) + '::uuid' if st else 'null'}, 'publication');""")
    return f"{o['name']} fez uma publicação"


def act_follow(p):
    target = R.choice([x for x in POOL.people if x['id'] != p['id']])
    as_user(p['id'], f"insert into follows (follower_id, following_id) values ({esc(p['id'])}::uuid, {esc(target['id'])}::uuid) on conflict do nothing;")
    return f"passou a seguir @{target['slug']}"


ACTIONS = {
    'buy': (act_buy, 30), 'schedule': (act_schedule, 16), 'comment': (act_comment, 16), 'community': (act_community, 12),
    'review': (act_review, 12), 'publish': (act_publish, 6), 'follow': (act_follow, 8),
}


def do_action(name, p=None):
    p = p or R.choice(POOL.customers)
    fn = ACTIONS[name][0]
    try:
        msg = fn(p)
        log(f"  • {p.get('name') or p['slug']} {msg}")
        return name, True
    except Exception as e:  # noqa: BLE001 — uma ação que falha (regra do banco) não derruba o simulador
        log(f"  ✗ {p.get('name') or p['slug']} tentou '{name}' e o banco recusou: {str(e).splitlines()[0][:140]}")
        return name, False



# ---------------------------------------------------------------- pedidos de serviço ("procurar serviço") e conversa das comunidades
REQUESTS = [
    ('eletricista', 'Preciso trocar o disjuntor e revisar a fiação da cozinha. O chuveiro desarma sempre.', 'Rua Rafael Vaz e Silva, 410, São Cristóvão, Porto Velho - RO'),
    ('eletricista', 'Instalação de luminárias de LED e tomadas novas na sala comercial.', 'Av. Calama, 880, Embratel, Porto Velho - RO'),
    ('encanador', 'Vazamento embaixo da pia da cozinha e torneira do tanque pingando.', 'Av. Jorge Teixeira, 1500, Industrial, Porto Velho - RO'),
    ('pintor', 'Pintura de apartamento de 2 quartos, paredes já preparadas.', 'Rua Euclides da Cunha, 77, Liberdade, Porto Velho - RO'),
    ('diarista', 'Diarista para limpeza pesada antes de uma mudança, uma vez só.', 'Rua das Palmeiras, 230, Porto Velho - RO'),
    ('jardineiro', 'Poda de duas árvores e limpeza do quintal (cerca de 120 m²).', 'Rua Campos Sales, 45, Centro, Porto Velho - RO'),
    ('montador', 'Montagem de guarda-roupa de 6 portas e uma cômoda, móveis já no local.', 'Av. Rio Madeira, 700, Mato Grosso, Porto Velho - RO'),
    ('instrutor', 'Aulas de violão para iniciante, duas vezes por semana.', 'Rua Almirante Barroso, 150, Centro, Porto Velho - RO'),
    ('personal', 'Personal para treino de força 3x por semana, foco em ganho de massa.', 'Academia perto do Shopping, Porto Velho - RO'),
    ('veterinario', 'Minha cachorrinha está sem apetite, preciso de consulta a domicílio.', 'Rua Dom Pedro II, 320, Centro, Porto Velho - RO'),
    ('dentista', 'Dor no dente do fundo há dois dias, preciso de avaliação ainda esta semana.', 'Av. Sete de Setembro, 900, Porto Velho - RO'),
    ('cabeleireiro', 'Corte e coloração em casa para minha mãe, que tem dificuldade de locomoção.', 'Rua José Bonifácio, 120, Olaria, Porto Velho - RO'),
    ('massageador', 'Massagem relaxante para dor nas costas no meu escritório.', 'Rua Tenreiro Aranha, 90, Centro, Porto Velho - RO'),
    ('psicologa', 'Busco psicóloga para acompanhamento semanal, de preferência online à noite.', 'Atendimento online'),
]
REQ_NOTES = ['Posso receber a partir das 14h.', 'Urgente, se possível ainda hoje.', 'Material por minha conta.', 'Combinamos o valor antes.', None, None]
CHAT_MORE = ['Pessoal, alguém já usou o agendamento do iUser?', 'Acabei de fazer um pedido e o frete foi rapidinho', 'Quem tem indicação de mecânico de confiança?', 'Bom dia, comunidade! ☀️',
             'Hoje é dia de feira, quem vai?', 'Esse app tá ajudando muito meu negócio', 'Passando pra agradecer as dicas de ontem', 'Alguém sabe se a padaria do centro abre domingo?',
             'Consegui um eletricista em menos de uma hora pelo iUser', 'Vendi tudo que fiz hoje, gratidão!', 'Alguém quer dividir uma corrida pro aeroporto?', 'Quem mais tá ouvindo o show da praça daqui?']
OWN_STORE_LINES = ['Pessoal, conheçam a minha loja:', 'Minha loja tá com novidades, dá uma olhada!', 'Quem precisa, é aqui:', 'Atendimento top, venham conhecer']
PRODUCT_LINES = ['Olha o que acabou de chegar:', 'Esse é o mais pedido da semana', 'Recomendo demais:', 'Promoção até sexta, vale a pena', 'Dá uma olhada nesse serviço:']
PROFILE_LINES = ['Me sigam por lá!', 'Meu perfil no iUser:', 'Quem quiser trocar uma ideia, me chama', 'Estou oferecendo serviços, dá uma olhada no meu perfil']
ASK_LINES = ['Acabei de pedir um {t} no iUser, alguém pode me indicar também?', 'Procurando {t} aqui em Porto Velho, publiquei o pedido no iUser', 'Quem é {t} e quer pegar um serviço? Está no procurar serviço do iUser',
             'Publiquei um pedido de {t} agora, quem atender fecha na hora']


def post_service_request():
    p = R.choice(POOL.customers)
    t, desc, addr = R.choice(REQUESTS)
    note = R.choice(REQ_NOTES)
    as_user(p['id'], f"""insert into service_requests (requester_id, service_type, location_address, location_needs_access, description, notes, photo_urls, status)
        values ({esc(p['id'])}::uuid, {esc(t)}, {esc(addr)}, {'true' if R.random() < 0.2 else 'false'}, {esc(desc)}, {esc(note) if note else 'null'}, '{{}}', 'pending');""")
    log(f"  🧰 {p['name']} publicou um pedido de {t} em Procurar serviço")
    return p, t


def apply_to_service_request():
    row = q_local("select id, service_type, requester_id from service_requests where status = 'pending' order by random() limit 1")
    if not row or not POOL.owners:
        return
    r = row[0]
    o = R.choice([x for x in POOL.owners if x['id'] != r['requester_id']] or POOL.owners)
    try:
        as_user(o['id'], f"insert into service_applications (service_request_id, applicant_id, status) values ({esc(r['id'])}::uuid, {esc(o['id'])}::uuid, 'pending');")
        log(f"  🤝 {o['name']} se candidatou a um pedido de {r['service_type']}")
    except Exception as e:  # noqa: BLE001
        msg = str(e).splitlines()[0][:110]
        if 'duplicate' not in msg:
            log(f"  ✗ candidatura ao pedido de serviço: {msg}")


def chat_message():
    """Uma mensagem numa comunidade: conversa, resposta ou o próprio link compartilhado (loja, produto, serviço, perfil, pedido de serviço)."""
    c = R.choice(POOL.comms)
    kind = R.choices(['chat', 'reply', 'store', 'product', 'profile', 'ask'], [38, 18, 12, 14, 8, 10])[0]
    ref_store = ref_product = ref_profile = reply = None
    who, content = None, None
    if kind in ('chat', 'reply', 'ask'):
        who = R.choice(c['members'])
        content = R.choice(CHAT + CHAT_MORE)
        if kind == 'reply':
            rows = q_local(f"select id from community_messages where community_id = {esc(c['id'])}::uuid order by created_at desc limit 8")
            if rows:
                reply = R.choice(rows)['id']
                content = R.choice(REPLIES)
        elif kind == 'ask':
            content = R.choice(ASK_LINES).format(t=R.choice(REQUESTS)[0])
            # com o link do pedido de verdade (vira cartão na sala): quem pediu fala do próprio pedido
            req = q_local(f"select id, requester_id from service_requests where status = 'pending' and requester_id in (select profile_id from community_members where community_id = {esc(c['id'])}::uuid) order by random() limit 1")
            if req:
                who = req[0]['requester_id']
                content += '\nhttp://localhost:3100/procurar-servico?pedido=' + req[0]['id']
    elif kind == 'store':
        s = R.choice(POOL.stores)
        who, ref_store, content = s['owner_id'], s['id'], R.choice(OWN_STORE_LINES)
    elif kind == 'product':
        it = R.choice(POOL.goods + POOL.services)
        s = POOL.by_store.get(it['store_id'])
        who = s['owner_id'] if s and R.random() < 0.75 else R.choice(c['members'])
        ref_product, content = it['id'], R.choice(PRODUCT_LINES)
    else:
        who = R.choice(POOL.people)['id']
        ref_profile, content = who, R.choice(PROFILE_LINES)
    as_user(who, f"""insert into community_members (community_id, profile_id) select {esc(c['id'])}::uuid, {esc(who)}::uuid
        where not exists (select 1 from community_members where community_id = {esc(c['id'])}::uuid and profile_id = {esc(who)}::uuid);
        insert into community_messages (community_id, profile_id, content, ref_store_id, ref_product_id, ref_profile_id, reply_to_id)
        values ({esc(c['id'])}::uuid, {esc(who)}::uuid, {esc(content)}, {esc(ref_store) + '::uuid' if ref_store else 'null'}, {esc(ref_product) + '::uuid' if ref_product else 'null'},
                {esc(ref_profile) + '::uuid' if ref_profile else 'null'}, {esc(reply) + '::uuid' if reply else 'null'});""")
    tag = {'store': ' [compartilhou a própria loja]', 'product': ' [compartilhou um item]', 'profile': ' [compartilhou o perfil]', 'reply': ' [resposta]'}.get(kind, '')
    log(f"  💬 #{c['slug']}: “{content[:60]}”{tag}")


def loop_forever(name, every, fn, stop):
    """Roda `fn` a cada `every` segundos numa thread, sem deixar um erro parar o simulador."""
    def run():
        while not stop.is_set():
            t0 = time.time()
            try:
                fn()
            except Exception as e:  # noqa: BLE001
                log(f"  ✗ {name}: {str(e).splitlines()[0][:120]}")
            stop.wait(max(0.2, every - (time.time() - t0)))
    th = threading.Thread(target=run, daemon=True, name=name)
    th.start()
    return th


def requests_round():
    post_service_request()
    if R.random() < 0.7:
        apply_to_service_request()

# ---------------------------------------------------------------- relógio das lojas e agendas
def tick_orders():
    rows = q_local("select o.id, o.status, s.owner_id from orders o join stores s on s.id = o.store_id where o.status in ('pending','preparing','ready') order by random() limit 8")
    for r in rows:
        nxt = {'pending': R.choices(['preparing', 'rejected'], [92, 8])[0], 'preparing': R.choice(['ready', 'paid']), 'ready': 'paid'}[r['status']]
        try:
            as_user(r['owner_id'], f"update orders set status = {esc(nxt)} where id = {esc(r['id'])}::uuid;")
            log(f"  🏪 pedido {r['id'][:8]}: {r['status']} → {nxt}")
        except Exception as e:  # noqa: BLE001
            log(f"  ✗ pedido {r['id'][:8]} ({r['status']}→{nxt}): {str(e).splitlines()[0][:100]}")


SERVICE_COMMENTS = ['Atendimento excelente, super recomendo', 'Tudo certo, voltarei', 'Bom serviço, preço justo', 'Poderia ser mais rápido, mas ficou bom', 'Profissional atencioso', '']
CLIENT_COMMENTS = ['Cliente pontual e educado', 'Tudo tranquilo', 'Chegou um pouco atrasado', 'Recomendo atender', 'Respeitoso e objetivo', '']


def tick_appointments():
    """Agendamentos: o dono confirma, depois marca "serviço feito" (RPC complete_appointment) e os dois lados se avaliam (RPC submit_appointment_review)."""
    rows = q_local("""select a.id, a.status, a.service_name, a.customer_id,
        case when a.store_id is not null then (select s.owner_id from stores s where s.id = a.store_id) else a.provider_profile_id end as svc_owner
        from appointments a where a.status in ('pending','confirmed') and a.created_at > now() - interval '2 hours' order by random() limit 8""")
    for r in rows:
        if not r['svc_owner']:
            continue
        nxt = 'confirmed' if r['status'] == 'pending' else 'completed'
        try:
            if nxt == 'confirmed':
                as_user(r['svc_owner'], f"update appointments set status = 'confirmed' where id = {esc(r['id'])}::uuid;")
            else:
                as_user(r['svc_owner'], f"select complete_appointment({esc(r['id'])}::uuid);")
            log(f"  📅 agendamento “{r['service_name']}”: {r['status']} → {nxt}" + (' (serviço feito)' if nxt == 'completed' else ''))
        except Exception as e:  # noqa: BLE001
            log(f"  ✗ agendamento {r['id'][:8]} ({r['status']}→{nxt}): {str(e).splitlines()[0][:100]}")
    # serviços feitos que ainda não foram avaliados: o cliente avalia o serviço e o dono avalia o cliente
    done = q_local("""select a.id, a.customer_id, a.service_name,
        case when a.store_id is not null then (select s.owner_id from stores s where s.id = a.store_id) else a.provider_profile_id end as svc_owner,
        exists (select 1 from appointment_reviews r where r.appointment_id = a.id and r.kind = 'service') as has_service,
        exists (select 1 from appointment_reviews r where r.appointment_id = a.id and r.kind = 'client') as has_client
        from appointments a where a.status = 'completed' and a.completed_at is not null and a.completed_at > now() - interval '3 hours'
        order by random() limit 6""")
    for r in done:
        if not r['svc_owner'] or r['svc_owner'] == r['customer_id']:
            continue
        for who, kind, has, comments in ((r['customer_id'], 'serviço', r['has_service'], SERVICE_COMMENTS), (r['svc_owner'], 'cliente', r['has_client'], CLIENT_COMMENTS)):
            if has or R.random() > 0.6:
                continue
            stars = R.choices([5, 4, 3, 2], [60, 28, 8, 4])[0]
            try:
                as_user(who, f"select submit_appointment_review({esc(r['id'])}::uuid, {stars}, {esc(R.choice(comments))});")
                log(f"  ⭐ avaliou o {kind} “{r['service_name']}” com {stars}★")
            except Exception as e:  # noqa: BLE001
                log(f"  ✗ avaliação do {kind}: {str(e).splitlines()[0][:100]}")


# ---------------------------------------------------------------- corridas
def ensure_driver_plans():
    """Motorista sem plano ativo não pode se candidatar (regra do banco): no simulador local ganha o brinde de 90 dias, como no app."""
    psql(['-c', """insert into subscriptions (user_id, plan_id, status, source, starts_at, current_period_end, granted_reason)
        select dp.driver_id, (select id from plans where code = 'pre_pago'), 'active', 'free_trial', now(), now() + interval '90 days', 'simulador local'
        from driver_pricing dp where dp.driver_mode_active and not coalesce((select has_driver from get_active_plan_grants(dp.driver_id)), false)"""])


def refresh_drivers():
    """Mantém os motoristas ativos com posição fresca (e se mexendo um pouco)."""
    psql(['-c', """update driver_pricing set
        live_lat = coalesce(live_lat, -8.7625) + (random() - 0.5) * 0.002, live_lng = coalesce(live_lng, -63.9040) + (random() - 0.5) * 0.002,
        live_updated_at = now(), live_location_sync = true where driver_mode_active"""])


def request_rides(target):
    """Mantém `target` pessoas com corrida ativa (pendente ou aceita)."""
    active = q_local("select count(distinct requester_id) as n from ride_requests where status in ('pending','accepted')")[0]['n']
    need = target - active
    if need <= 0:
        return
    free = q_local("""select p.id, p."profileSlug" as slug, p.name from profiles p join auth.users u on u.id = p.id
        where u.email like 'cliente-%@staging.iuser.test' and not exists (select 1 from ride_requests r where r.requester_id = p.id and r.status in ('pending','accepted'))
        and p.id not in (__R__) and not exists (select 1 from driver_pricing d where d.driver_id = p.id and d.driver_mode_active) order by random() limit {need}""".replace('{need}', str(need)).replace('__R__', RESERVED_SQL))
    for p in free:
        a, b = R.sample(POINTS, 2)
        while hav(a[1], a[2], b[1], b[2]) < 0.8:
            a, b = R.sample(POINTS, 2)
        km = round(hav(a[1], a[2], b[1], b[2]) * 1.3, 1)
        try:
            as_user(p['id'], f"""insert into ride_requests (requester_id, ride_type, origin_address, destination_address, status, passenger_count, vehicle_type, origin_lat, origin_lng,
                destination_lat, destination_lng, distance_km, duration_min)
                values ({esc(p['id'])}::uuid, 'pessoa', {esc(point_address(a))}, {esc(point_address(b))}, 'pending',
                       {R.choice([1, 1, 1, 2, 3])}, 'carro', {a[1]}, {a[2]}, {b[1]}, {b[2]}, {km}, {max(3, round(km * 2.4))});""")
            log(f"  🚗 {p['name']} pediu um motorista: {a[3]} → {b[3]} ({km} km)")
        except Exception as e:  # noqa: BLE001
            log(f"  ✗ {p['name']} não conseguiu pedir motorista: {str(e).splitlines()[0][:140]}")


def drive_rides():
    # 1) motoristas livres se candidatam às corridas pendentes
    pend = q_local("select id, distance_km, origin_lat, origin_lng from ride_requests where status = 'pending' order by created_at")
    if pend:
        free = q_local("""select dp.driver_id as id, p.name from driver_pricing dp join profiles p on p.id = dp.driver_id where dp.driver_mode_active and dp.driver_id not in (__R__)
            and not exists (select 1 from ride_requests r where r.driver_id = dp.driver_id and r.status = 'accepted')
            and (select count(*) from ride_applications a where a.applicant_id = dp.driver_id and a.status = 'pending') < 2 order by random() limit 6""".replace('__R__', RESERVED_SQL))
        for d in free:
            r = R.choice(pend)
            price = round(7 + float(r['distance_km'] or 3) * 2.1 + R.random() * 2, 2)
            try:
                as_user(d['id'], f"insert into ride_applications (ride_request_id, applicant_id, proposed_price) values ({esc(r['id'])}::uuid, {esc(d['id'])}::uuid, {price});")
                log(f"  🙋 {d['name']} se candidatou a uma corrida (R$ {price:.2f})".replace('.', ',', 1) if False else f"  🙋 {d['name']} se candidatou a uma corrida (R$ {price})")
            except Exception as e:  # noqa: BLE001
                msg = str(e).splitlines()[0][:110]
                if 'duplicate' not in msg:
                    log(f"  ✗ {d['name']} não pôde se candidatar: {msg}")
    # 2) passageiros escolhem um dos candidatos
    for r in q_local("""select r.id, r.requester_id, (select a.id from ride_applications a where a.ride_request_id = r.id and a.status = 'pending' order by random() limit 1) as app
        from ride_requests r where r.status = 'pending' and exists (select 1 from ride_applications a where a.ride_request_id = r.id and a.status = 'pending')
        and r.created_at < now() - interval '8 seconds' order by random() limit 6"""):
        try:
            as_user(r['requester_id'], f"select select_ride_driver({esc(r['id'])}::uuid, {esc(r['app'])}::uuid);")
            log(f"  ✅ passageiro escolheu um motorista (corrida {r['id'][:8]})")
        except Exception as e:  # noqa: BLE001
            log(f"  ✗ escolha de motorista falhou: {str(e).splitlines()[0][:110]}")
    # 3) corridas aceitas andam um passo por tick
    for r in q_local("""select id, driver_id, requester_id, destination_lat, destination_lng, driver_en_route, driver_arrived_at is not null as arrived, ride_started_at is not null as started
        from ride_requests where status = 'accepted' and driver_id is not null"""):
        did, rid = r['driver_id'], r['id']
        try:
            if not r['driver_en_route']:
                as_user(did, f"update ride_requests set driver_en_route = true, driver_departed_at = now() where id = {esc(rid)}::uuid;"); step = 'a caminho da partida'
            elif not r['arrived']:
                as_user(did, f"update ride_requests set driver_arrived_at = now() where id = {esc(rid)}::uuid;"); step = 'chegou à partida'
            elif not r['started']:
                as_user(did, f"update ride_requests set ride_started_at = now() where id = {esc(rid)}::uuid;"); step = 'corrida iniciada'
            else:
                as_user(did, f"select complete_ride({esc(rid)}::uuid, {r['destination_lat']}, {r['destination_lng']});"); step = 'CORRIDA CONCLUÍDA'
                rate_ride(rid, did, r['requester_id'])
            log(f"  🚦 corrida {rid[:8]}: {step}")
        except Exception as e:  # noqa: BLE001
            log(f"  ✗ corrida {rid[:8]} ({'' if r['driver_en_route'] else 'saída'}): {str(e).splitlines()[0][:120]}")


def rate_ride(rid, driver, passenger):
    rating = R.choices([5, 4, 3, 2, 1], [58, 26, 9, 4, 3])[0]
    try:
        as_user(passenger, f"insert into ride_reviews (ride_request_id, reviewer_id, reviewee_id, rating, comment) values ({esc(rid)}::uuid, {esc(passenger)}::uuid, {esc(driver)}::uuid, {rating}, {esc(R.choice(RIDE_COMMENTS)) if R.random() < 0.6 else 'null'});")
        log(f"  ⭐ passageiro avaliou o motorista com {rating}★")
    except Exception as e:  # noqa: BLE001
        log(f"  ✗ avaliação da corrida: {str(e).splitlines()[0][:110]}")
    if R.random() < 0.5:
        try:
            as_user(driver, f"insert into ride_reviews (ride_request_id, reviewer_id, reviewee_id, rating, comment) values ({esc(rid)}::uuid, {esc(driver)}::uuid, {esc(passenger)}::uuid, {R.choice([5, 5, 4])}, {esc(R.choice(PASSENGER_COMMENTS)) if R.random() < 0.5 else 'null'});")
        except Exception:  # noqa: BLE001
            pass


# ---------------------------------------------------------------- crescimento
STAT_SQL = """select json_build_object(
  'pedidos', (select count(*) from orders), 'receita', (select coalesce(round(sum(total_amount)::numeric, 2), 0) from orders where status = 'paid'),
  'agendamentos', (select count(*) from appointments), 'ag_concluidos', (select count(*) from appointments where status = 'completed'),
  'corridas_pedidas', (select count(*) from ride_requests), 'corridas_ativas', (select count(*) from ride_requests where status in ('pending','accepted')),
  'corridas_concluidas', (select count(*) from ride_requests where status = 'completed'),
  'aval_corridas', (select count(*) from ride_reviews), 'aval_compras', (select count(*) from product_reviews),
  'comentarios', (select count(*) from comments), 'msgs_comunidade', (select count(*) from community_messages),
  'publicacoes', (select count(*) from products where listing_type = 'publication'), 'servicos', (select count(*) from products where type = 'service'),
  'seguidores', (select count(*) from follows), 'curtidas', (select count(*) from likes),
  'nota_motoristas', (select coalesce(round(avg(rating)::numeric, 2), 0) from ride_reviews), 'pedidos_servico', (select count(*) from service_requests)
)"""
COLS = ['pedidos', 'receita', 'agendamentos', 'ag_concluidos', 'corridas_pedidas', 'corridas_ativas', 'corridas_concluidas', 'aval_corridas', 'aval_compras', 'comentarios', 'msgs_comunidade',
        'publicacoes', 'servicos', 'seguidores', 'curtidas', 'nota_motoristas', 'pedidos_servico']
LABELS = {'pedidos': 'pedidos', 'receita': 'receita R$', 'agendamentos': 'agendam.', 'ag_concluidos': 'ag.concl.', 'corridas_pedidas': 'corridas', 'corridas_ativas': 'ativas',
          'corridas_concluidas': 'concluídas', 'aval_corridas': 'aval.corr.', 'aval_compras': 'aval.compra', 'comentarios': 'coment.', 'msgs_comunidade': 'msgs',
          'publicacoes': 'public.', 'servicos': 'serviços', 'seguidores': 'seguid.', 'curtidas': 'curtidas', 'nota_motoristas': 'nota mot.', 'pedidos_servico': 'ped.serv.'}


def stats():
    return json.loads(psql(['-At', '-c', STAT_SQL]).strip())


def print_growth(tick, now, prev, first):
    parts = []
    for k in COLS:
        d = float(now[k]) - float(prev[k]) if prev else 0
        base = float(now[k]) - float(first[k])
        parts.append(f"{LABELS[k]} {now[k]}" + (f" ({d:+g})" if d else ''))
    log(f"📈 tick {tick} · " + ' · '.join(parts))
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, 'crescimento.csv')
    new = not os.path.exists(path)
    with open(path, 'a', newline='') as f:
        w = csv.writer(f)
        if new:
            w.writerow(['hora', 'tick'] + COLS)
        w.writerow([datetime.now().strftime('%Y-%m-%d %H:%M:%S'), tick] + [now[k] for k in COLS])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--people', type=int, default=10, help='pessoas que agem por tick')
    ap.add_argument('--interval', type=float, default=10, help='segundos entre ticks')
    ap.add_argument('--rides', type=int, default=20, help='pessoas com corrida ativa o tempo todo')
    ap.add_argument('--ticks', type=int, default=0, help='0 = até Ctrl-C')
    ap.add_argument('--requests-every', type=float, default=20, help='segundos entre pedidos de serviço publicados (Procurar serviço)')
    ap.add_argument('--chat-every', type=float, default=4, help='segundos entre mensagens nas comunidades')
    ap.add_argument('--once', choices=list(ACTIONS) + ['request', 'chat'], help='roda uma ação só e sai')
    ap.add_argument('--stats', action='store_true')
    ap.add_argument('--seed', type=int)
    args = ap.parse_args()
    if args.seed is not None:
        R.seed(args.seed)
    if args.stats:
        print(json.dumps(stats(), ensure_ascii=False, indent=1)); return
    ensure_driver_plans()
    POOL.load()
    log(f"Simulador (banco LOCAL): {len(POOL.customers)} clientes · {len(POOL.owners)} donos · {len(POOL.stores)} lojas · {len(POOL.drivers)} motoristas · {len(POOL.pubs)} publicações · {len(POOL.comms)} comunidades")
    if args.once == 'request':
        requests_round(); return
    if args.once == 'chat':
        chat_message(); return
    if args.once:
        do_action(args.once); return
    names, weights = list(ACTIONS), [ACTIONS[k][1] for k in ACTIONS]
    first = prev = stats()
    tick = 0
    stop = threading.Event()
    loop_forever('pedidos de serviço', args.requests_every, requests_round, stop)
    loop_forever('conversa das comunidades', args.chat_every, chat_message, stop)
    try:
        while True:
            t0 = time.time()
            tick += 1
            if tick % 30 == 0:
                POOL.load()
            log(f"── tick {tick}: {args.people} pessoas agindo + {args.rides} corridas ativas ──")
            try:
                refresh_drivers()
                people = R.sample(POOL.customers, args.people)
                with ThreadPoolExecutor(max_workers=5) as ex:
                    futs = [ex.submit(do_action, R.choices(names, weights)[0], p) for p in people]
                    for f in futs:
                        f.result()
                tick_orders()
                tick_appointments()
                request_rides(args.rides)
                drive_rides()
                now = stats()
                print_growth(tick, now, prev, first)
                prev = now
            except RuntimeError as e:  # banco/Docker caiu (OrbStack reiniciou, por ex.): espera e tenta no próximo ciclo em vez de morrer
                log(f"  ⚠ banco indisponível, tentando de novo em 15 s: {str(e).splitlines()[0][:120]}")
                time.sleep(15)
                continue
            if args.ticks and tick >= args.ticks:
                break
            time.sleep(max(0, args.interval - (time.time() - t0)))
    except KeyboardInterrupt:
        log('Parado.')
    finally:
        stop.set()


if __name__ == '__main__':
    main()
