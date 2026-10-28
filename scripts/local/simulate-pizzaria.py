#!/usr/bin/env python3
"""Movimento da Pizzaria Forno de Ouro (conta admin-teste) — SÓ no Supabase LOCAL. CICLO COMPLETO, do pedido à avaliação.

Clientes de teste agem COMO ELES MESMOS (papel `authenticated` + JWT: RLS, gatilhos e RPCs valem) e a loja (a conta admin-teste, também como ela
mesma) atende:
  - PEDIDOS: chegam a cada --every s (pizzas com adicionais, entrega/retirada, Pix/cartão/dinheiro) e AGENDAMENTOS (rodízio, Ambiente VIP) a cada --appts-every s;
  - CONVERSAS: clientes puxam conversa com a loja (entrega no bairro, ingredientes, horário do rodízio, reserva do Ambiente VIP, tempo do pedido) e a
    loja responde; a loja também avisa em cada etapa do pedido e o cliente agradece;
  - ATENDIMENTO: pedido pendente → a loja aceita (ou recusa, raramente) → em preparo → pronto / saiu para entrega → entregue (pago) → o cliente
    recebe, comenta no chat e AVALIA a compra; agendamentos pendentes são confirmados (entrada Pix confirmada) e, no dia, marcados como feitos.
  - MOTOBOYS: pedido de ENTREGA pronto não vai mais "do nada" para entregue. Os entregadores da loja (tabela employees; node scripts/local/seed-motoboys.mjs) saem
    com VÁRIAS entregas de uma vez: a loja junta os pedidos prontos que cabem na mochila (--bag) e ficam perto uns dos outros (--reach km), espera um pouco para
    juntar mais (--wait s) e atribui a rota (delivery_assignments, em ordem do mais perto); o motoboy pega todos e entrega um por um (o tempo de cada trecho
    vem da distância; --time-scale comprime o relógio), pelo MESMO endpoint que a página /entregador/<token> usa. Depois a loja finaliza, o cliente agradece e avalia.
  - MOTORISTAS iUSER (padrão): a loja usa o entregador do iUser (node scripts/local/seed-entregadores.mjs: Dani, Léo, Rafa e Tito, cada um com a sua "mochila"
    = quantas entregas cabem). Quando a loja aceita o pedido a entrega aparece para eles (/entregas) e cada um ACEITA se quiser (disposição própria), dentro do que
    cabe e perto das que já pegou; vai à loja, espera o pedido ficar PRONTO, pega todos de uma vez e entrega um por um na ordem do mais perto, concluindo pelo
    MESMO caminho do app (complete_ride). --manual-drivers dani deixa a Dani para a pessoa mexer na mão (/entregas). --employees volta aos motoboys da loja.
  - AVALIAÇÕES: depois da entrega a LOJA avalia o motorista iUser (ride_reviews) e o cliente avalia a compra (product_reviews). `--once rate` avalia de uma vez tudo que está pendente.
  Com --manual só chegam pedidos/agendamentos (nada é atendido): quem atende é a pessoa, pelo app. --no-couriers volta ao jeito antigo (pronto → entregue).
O simulador do ecossistema (simulate-ecosystem.py) NÃO mexe nessa loja.

  node scripts/local/seed-pizzaria.mjs                       # (uma vez) cria a loja, o cardápio e os serviços
  python3 -u scripts/local/simulate-pizzaria.py              # ciclo completo (Ctrl-C para parar)
  python3 -u scripts/local/simulate-pizzaria.py --burst 0 --every 30 --appts-every 120 --speed 1
  python3 -u scripts/local/simulate-pizzaria.py --manual     # só chegam pedidos; você atende
  python3 scripts/local/simulate-pizzaria.py --once order    # só um pedido (ou: --once appointment | chat | tick)
"""
import argparse, json, math, os, random, re, sys, threading, time, urllib.request
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import psql, q_local  # noqa: E402

UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
R = random.Random()
LOCK = threading.Lock()
SLUG = 'pizzaria-forno-de-ouro'
# Contas reservadas (Ana Silva e Felipe Costa) para a pessoa mexer na mão
RESERVED = ('28e08603-96b0-49fc-867e-efc3d8e7d63b', 'e72ff0cd-7a15-4177-b615-a035d3ef569c')


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"


def as_user(uid, sql):
    claims = json.dumps({'sub': uid, 'role': 'authenticated'})
    script = f"begin;\nselect set_config('request.jwt.claim.sub', {esc(uid)}, true), set_config('request.jwt.claims', {esc(claims)}, true);\nset local role authenticated;\n{sql}\ncommit;\n"
    return psql(['-At'], stdin=script)


def last_line(out):
    lines = [l for l in out.strip().splitlines() if l.strip() and l.strip() not in ('BEGIN', 'COMMIT', 'SET')]
    return lines[-1] if lines else ''


def log(msg):
    with LOCK:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


STREETS = [('Rua das Palmeiras', -8.7612, -63.9008), ('Av. Jorge Teixeira', -8.7541, -63.8932), ('Rua Dom Pedro II', -8.7645, -63.9051), ('Av. Calama', -8.7522, -63.9120),
           ('Rua Rafael Vaz e Silva', -8.7660, -63.9066), ('Av. Campos Sales', -8.7604, -63.9077), ('Rua Almirante Barroso', -8.7619, -63.9002), ('Av. Presidente Dutra', -8.7633, -63.9034)]
COMMENTS = ['Sem cebola, por favor', 'Capricha no queijo', 'Cortar em 12 fatias', 'Bem passada', 'Sem azeitona', 'Tocar o interfone', 'Pode mandar o troco separado', None, None, None, None]
APPT_NOTES = {'Rodízio': (2, 8), 'Ambiente VIP': (6, 20)}

STORE = {}
COURIERS = []
IUSER_DRIVERS = []
DRV = {}   # estado em memória de cada motorista iUser (posição, quando saiu, quando entregou o último)
EAGER = {'dani': 0.85, 'leo': 0.6, 'rafa': 0.75, 'tito': 0.45}   # disposição de cada um para aceitar uma entrega que aparece
CFG = {'stage': False, 'stage_grace': 30.0, 'stage_speed': 5.0, 'mode': 'iuser', 'manual_drivers': [], 'couriers': True, 'bag': 6.0, 'max_stops': 5, 'reach': 3.5, 'wait': 45.0, 'load': 20.0, 'scale': 6.0, 'app': os.environ.get('APP_URL', 'http://localhost:3100')}
FEATURED_EMAIL = 'cliente-007@staging.iuser.test'   # a cliente que a página /tres-telas acompanha (pede com frequência)
FEATURED = None
STORE_POS = (-8.7580, -63.8995)
CUSTOMERS = []
GOODS = []
ADDONS = {}
SERVICES = []


def load():
    global STORE, CUSTOMERS, GOODS, ADDONS, SERVICES, COURIERS, FEATURED
    s = q_local(f"select id, name, \"storeSlug\" as slug, owner_id, logo_url from stores where \"storeSlug\" = {esc(SLUG)}")
    if not s:
        sys.exit('Loja não encontrada: rode antes  node scripts/local/seed-pizzaria.mjs')
    STORE = s[0]
    CUSTOMERS = q_local("select p.id, p.\"profileSlug\" as slug, p.name from profiles p join auth.users u on u.id = p.id where u.email like 'cliente-%@staging.iuser.test' and p.id not in ("
                        + ','.join(f"'{x}'" for x in RESERVED) + ")")
    GOODS = q_local(f"select id, name, category, price, has_addons from products where store_id = {esc(STORE['id'])}::uuid and is_active and type = 'physical'")
    ADDONS = {}
    for a in q_local(f"select id, product_id from product_addons where store_id = {esc(STORE['id'])}::uuid and is_active"):
        ADDONS.setdefault(a['product_id'], []).append(a['id'])
    SERVICES = q_local(f"select id, name, price, category, coalesce(duration_minutes, 60) as dur from products where store_id = {esc(STORE['id'])}::uuid and is_active and type = 'service' and listing_type = 'sale'")
    COURIERS = q_local(f"select id, name, access_token from employees where store_id = {esc(STORE['id'])}::uuid and is_active order by created_at")
    f = q_local(f"select p.id, p.\"profileSlug\" as slug, p.name from profiles p join auth.users u on u.id = p.id where u.email = {esc(FEATURED_EMAIL)}")
    FEATURED = f[0] if f else None
    IUSER_DRIVERS.clear()
    IUSER_DRIVERS.extend(q_local("""select p.id, p.name, split_part(split_part(u.email, '@', 1), '-', 2) as key, coalesce(v.delivery_capacity, 1) as cap
        from profiles p join auth.users u on u.id = p.id join driver_vehicles v on v.driver_id = p.id
        where u.email like 'entregador-%@staging.iuser.test' order by u.email"""))
    if CFG['mode'] == 'iuser' and not IUSER_DRIVERS:
        CFG['mode'] = 'employees'
        log('(sem motoristas iUser: rode  node scripts/local/seed-entregadores.mjs — usando os motoboys da loja)')
    if CFG['mode'] == 'employees' and CFG['couriers'] and not COURIERS:
        CFG['couriers'] = False
        log('(sem motoboys cadastrados: rode  node scripts/local/seed-motoboys.mjs  — entregas vão direto de pronto para entregue)')


def make_order(c=None, force_delivery=False):
    c = c or R.choice(CUSTOMERS)
    pizzas = [g for g in GOODS if g['category'] in ('Pizzas tradicionais', 'Pizzas especiais', 'Pizzas doces')]
    combos = [g for g in GOODS if g['category'] == 'Promoções']
    drinks = [g for g in GOODS if g['category'] == 'Refrigerantes e bebidas']
    extras = [g for g in GOODS if g['category'] in ('Entradas e porções', 'Sobremesas')]
    picks = []
    kind = R.random()
    if kind < 0.25 and combos:
        picks.append(R.choice(combos))
    else:
        picks += R.sample(pizzas, R.choice([1, 1, 2, 2, 3]))
    if R.random() < 0.8:
        picks.append(R.choice(drinks))
    if R.random() < 0.35 and extras:
        picks.append(R.choice(extras))
    items = []
    for g in picks:
        ids = ADDONS.get(g['id'], []) if g['has_addons'] else []
        chosen = R.sample(ids, min(len(ids), R.choice([0, 0, 1, 1, 2, 3]))) if ids else []
        items.append({'product_id': g['id'], 'quantity': R.choice([1, 1, 1, 2]) if g['category'] == 'Refrigerantes e bebidas' else 1,
                      'comment': R.choice(COMMENTS) if g['has_addons'] else None, 'addons': [{'id': a} for a in chosen]})
    deliver = force_delivery or R.random() < 0.65
    pay = R.choice(['pix', 'pix', 'cartao', 'cartao', 'dinheiro'])
    street, lat, lng = R.choice(STREETS)
    lat, lng = lat + R.uniform(-0.006, 0.006), lng + R.uniform(-0.006, 0.006)   # cada casa num ponto (os pedidos prontos formam grupos perto e longe)
    addr = f"{street}, {R.randint(100, 2500)}, Porto Velho - RO" if deliver else 'null'
    change = 'null'
    if pay == 'dinheiro':
        change = R.choice(['100', '100', '200', '50'])
    contactless = 'true' if pay == 'cartao' and R.random() < 0.5 else ('false' if pay == 'cartao' else 'null')
    sql = (f"select create_store_order({esc(STORE['id'])}::uuid, {esc(json.dumps(items))}::jsonb, {esc('entrega' if deliver else 'retirada')}, {esc(pay)}, "
           f"{esc(addr) if deliver else 'null'}, {lat if deliver else 'null'}, {lng if deliver else 'null'}, {change}, {contactless}, null, gen_random_uuid());")
    d = json.loads(last_line(as_user(c['id'], sql)))
    total = float(d['total_amount'])
    log(f"🍕 pedido de {c['name']}{' ★' if FEATURED and c['id'] == FEATURED['id'] else ''}: {len(items)} item(ns), {'entrega' if deliver else 'retirada'}, {pay} — R$ {total:.2f}".replace('.', ','))


def free_slot(dur):
    """Acha um dia/hora sem sobrepor outro agendamento da loja. (O banco impede que a mesma pessoa tenha dois compromissos ao mesmo tempo, e na loja quem
    recebe é o dono: por isso só cabe UM agendamento por horário.)"""
    busy = {}
    for r in q_local(f"select date::text as dia, time::text as hora, coalesce(duration_minutes, 60) as dur from appointments where provider_profile_id = {esc(STORE['owner_id'])}::uuid "
                     f"and status in ('pending','confirmed','completed') and date >= current_date"):
        h, m = int(r['hora'][:2]), int(r['hora'][3:5])
        busy.setdefault(r['dia'], []).append((h * 60 + m, h * 60 + m + int(r['dur'])))
    for _ in range(60):
        day = (datetime.now() + timedelta(days=R.randint(1, 60))).date()
        start = R.choice(range(11 * 60, 21 * 60 + 1, 30))
        if any(start < e and b < start + dur for b, e in busy.get(str(day), [])):
            continue
        return day, start // 60, start % 60
    return None


def make_appointment():
    c = R.choice(CUSTOMERS)
    svc = R.choice(SERVICES)
    slot = free_slot(svc['dur'])
    if not slot:
        return log('  (agenda cheia nos próximos dias)')
    day, hour, minute = slot
    lo, hi = (2, 6) if 'Mesa' in svc['name'] else APPT_NOTES.get(svc['category'], (2, 6))
    people = R.randint(lo, hi)
    items = json.dumps([{'product_id': svc['id'], 'quantity': 1}])
    sql = f"""insert into appointments (store_id, store_slug, store_name, store_logo_url, customer_id, customer_slug, owner_id, owner_slug, provider_profile_id, date, time, duration_minutes,
        service_name, service_type, people_count, status, direction, is_public, service_items)
        select {esc(STORE['id'])}::uuid, {esc(STORE['slug'])}, {esc(STORE['name'])}, {esc(STORE['logo_url'] or '')}, {esc(c['id'])}::uuid, {esc(c['slug'])}, {esc(STORE['owner_id'])}::uuid,
               {esc(STORE['slug'])}, {esc(STORE['owner_id'])}::uuid, {esc(str(day))}::date, {esc('%02d:%02d:00' % (hour, minute))}::time, {svc['dur']},
               {esc(svc['name'])}, 'service', {people}, 'pending', 'outgoing', false, {esc(items)}::jsonb returning id;"""
    out = as_user(c['id'], sql)
    ids = re.findall(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', out)   # o 1º é o do set_config (a pessoa); o último é o do agendamento
    m = ids[-1] if ids else None
    paid = ''
    if m and R.random() < 0.65:
        as_user(c['id'], f"select report_appointment_deposit({esc(m)}::uuid);")
        paid = ' — entrada informada por Pix'
    log(f"📅 agendamento de {c['name']}: {svc['name']} para {people} pessoas em {day.strftime('%d/%m')} {hour:02d}:{minute:02d}{paid}")


# ---------------------------------------------------------------- conversas
ASKS = [('Vocês entregam no bairro {b}?', 'entrega'), ('Quanto tempo demora uma pizza grande?', 'tempo'), ('A pizza de camarão tem lactose?', 'lactose'),
        ('Dá pra fazer meio a meio?', 'meio'), ('Qual o horário do rodízio hoje?', 'rodizio'), ('Vocês reservam o Ambiente VIP no sábado?', 'vip'),
        ('Tem opção sem glúten?', 'gluten'), ('Aceitam cartão na entrega?', 'cartao'), ('Posso trocar a borda depois de pedir?', 'borda'), ('Qual o valor do Ambiente VIP para 15 pessoas?', 'vip'),
        ('Vocês têm cardápio infantil?', 'rodizio'), ('Está aberto agora?', 'aberto')]
BAIRROS = ['Centro', 'Embratel', 'Olaria', 'Caiari', 'São Cristóvão', 'Pedrinhas', 'Liberdade', 'Industrial']
ANSWERS = {
    'entrega': 'Entregamos sim! A taxa é R$ 7,00 fixa em toda a cidade e a entrega leva uns 40 minutos. 🛵',
    'tempo': 'A pizza grande fica pronta em uns 30 a 40 minutos, já com a entrega. 🍕',
    'lactose': 'Tem sim, o catupiry e a mussarela têm lactose. Posso sugerir a Margherita sem queijo extra, é só pedir nas observações!',
    'meio': 'Dá sim! Escolha dois sabores tradicionais e avise nas observações do pedido que fazemos meio a meio, sem custo extra.',
    'rodizio': 'O rodízio roda todos os dias das 11h às 23h e dura 2 horas. Adulto R$ 69,90, criança R$ 39,90 e premium com bebida à vontade R$ 94,90. 🍕',
    'vip': 'Temos o Ambiente VIP para até 20 pessoas! É só agendar pelo app, na página da loja. A entrada é de 30% e o restante você acerta no dia.',
    'gluten': 'Ainda não temos massa sem glúten, mas a Pepperoni e a Margherita podem sair em formato de calzone no forno a lenha. Quer?',
    'cartao': 'Aceitamos cartão (débito e crédito), Pix e dinheiro na entrega. Leve o troco combinado que a gente já separa. 💳',
    'borda': 'Se o pedido ainda não estiver no forno dá sim! Me avise aqui rapidinho que eu troco para você.',
    'aberto': 'Estamos abertos todos os dias, das 11h às 23h59. Pode pedir! 🍕',
}
GENERIC = ['Oi! Em que posso ajudar? 😊', 'Claro, pode falar!', 'Estamos à disposição, é só pedir pelo app. 🍕']
THANKS = ['Obrigado!', 'Valeu, vou pedir!', 'Perfeito, obrigada!', 'Show, fechado então', 'Muito obrigado pelo atendimento 🙏']
AFTER_ACCEPT = ['Pedido recebido! Já estamos preparando a sua pizza. 🍕', 'Oi! Seu pedido foi aceito e já vai para o forno. 🔥', 'Pedido confirmado! Em breve ele estará pronto. 🍕']
AFTER_READY_DELIVERY = ['Seu pedido saiu para entrega! 🛵 Chega em instantes.', 'Pizza quentinha a caminho! 🛵']
AFTER_READY_COURIER = ['Seu pedido está pronto! O motoboy já vai sair com ele. 🛵', 'Pronto! Só esperando o motoboy pegar a rota. 🍕🛵']
AFTER_READY_PICKUP = ['Seu pedido está pronto! Pode retirar no balcão. 🍕', 'Pronto! Pode vir buscar, está quentinho. 🍕']
AFTER_PAID_CUSTOMER = ['Chegou quentinha, obrigado!', 'Recebi! Estava deliciosa 😋', 'Tudo certo, muito obrigada!', 'Chegou rapidinho, parabéns!', 'Peguei aqui, valeu!']
REVIEWS_GOOD = ['Pizza maravilhosa, massa leve e bem recheada!', 'Chegou quentinha e rápido. Recomendo!', 'A melhor pizza da cidade, sem dúvida.', 'Adorei os ingredientes extras, ficou do jeito que pedi.', 'Atendimento excelente e entrega no tempo.', 'Borda recheada perfeita!', '']
REVIEWS_OK = ['Boa, mas demorou um pouquinho.', 'Gostoso, só veio um pouco morna.', 'Bom custo-benefício.']

_conv_cache = {}


def conv_with(customer_id):
    """Conversa (cliente ↔ loja): abre ou retoma pelo próprio cliente (RPC start_conversation) e guarda o id."""
    if customer_id not in _conv_cache:
        out = as_user(customer_id, f"select start_conversation(null, {esc(STORE['id'])}::uuid);")
        _conv_cache[customer_id] = re.findall(UUID, out)[-1]
    return _conv_cache[customer_id]


def say(sender_id, customer_id, text):
    cid = conv_with(customer_id)
    as_user(sender_id, f"insert into direct_messages (conversation_id, sender_id, content) values ({esc(cid)}::uuid, {esc(sender_id)}::uuid, {esc(text)});")


def owner_say(customer_id, text):
    say(STORE['owner_id'], customer_id, text)


def customer_asks():
    c = R.choice(CUSTOMERS)
    q, _ = R.choice(ASKS)
    q = q.format(b=R.choice(BAIRROS))
    say(c['id'], c['id'], q)
    log(f"💬 {c['name']} pergunta à loja: “{q}”")


def chat_tick(limit=3):
    """A loja responde quem escreveu e ainda não foi respondido; o cliente às vezes agradece."""
    rows = q_local(f"""select c.id, c.customer_id, m.content, (select count(*) from direct_messages x where x.conversation_id = c.id) as n, m.sender_id, extract(epoch from now() - m.created_at) as age
        from conversations c join lateral (select * from direct_messages d where d.conversation_id = c.id order by d.created_at desc limit 1) m on true
        where c.store_id = {esc(STORE['id'])}::uuid and m.created_at > now() - interval '40 minutes' order by random() limit 30""")
    done = 0
    for r in rows:
        if done >= limit:
            break
        age = float(r['age'])
        if r['sender_id'] != STORE['owner_id'] and age > 8:
            text = r['content'].lower()
            key = next((k for k, w in (('entrega', 'entreg'), ('tempo', 'demora'), ('lactose', 'lactose'), ('meio', 'meio a meio'), ('rodizio', 'rod'), ('vip', 'vip'), ('gluten', 'glúten'),
                                       ('cartao', 'cartão'), ('borda', 'borda'), ('aberto', 'aberto')) if w in text), None)
            if key is None and ('quanto tempo' in text or 'demora' in text):
                key = 'tempo'
            reply = ANSWERS.get(key) if key else (R.choice(['De nada! 🍕', 'Por nada, volte sempre!', 'Disponha! 😊']) if any(t in text for t in ('obrigad', 'valeu', 'show', 'perfeito', 'recebi', 'chegou', 'peguei')) else R.choice(GENERIC))
            owner_say(r['customer_id'], reply)
            log(f"  🏪 loja responde a {text[:40]!r}: “{reply[:60]}”")
            done += 1
        elif r['sender_id'] == STORE['owner_id'] and 10 < age < 120 and int(r['n']) < 4 and R.random() < 0.4:
            say(r['customer_id'], r['customer_id'], R.choice(THANKS))
            log('  💬 cliente agradece')
            done += 1


# ---------------------------------------------------------------- atendimento (o ciclo do pedido)
def store_orders(status, min_age):
    skip = f"and o.buyer_id <> {esc(FEATURED['id'])}::uuid" if (CFG['stage'] and FEATURED) else ''   # no TEATRO, os pedidos da cliente em destaque são atendidos pelas telas
    return q_local(f"""select o.id, o.buyer_id, o.delivery_option, o.total_amount, extract(epoch from now() - o.updated_at) as age from orders o
        where o.store_id = {esc(STORE['id'])}::uuid and o.status = {esc(status)} {skip} and o.updated_at < now() - interval '{min_age} seconds' order by o.updated_at limit 12""")


def set_status(order, status):
    as_user(STORE['owner_id'], f"update orders set status = {esc(status)} where id = {esc(order['id'])}::uuid;")


def attend_orders(speed):
    n = lambda t: t / speed
    for o in store_orders('pending', 12):
        if R.random() < min(1, 0.35 * speed):
            if R.random() < 0.03:
                set_status(o, 'rejected')
                owner_say(o['buyer_id'], 'Desculpe, acabou um ingrediente do seu pedido e não conseguimos atender agora. Foi mal! Peça de novo daqui a pouco. 🙏')
                log(f"  🏪 pedido {o['id'][:8]} recusado")
            else:
                set_status(o, 'preparing')
                owner_say(o['buyer_id'], R.choice(AFTER_ACCEPT))
                log(f"  🏪 pedido {o['id'][:8]} aceito → em preparo")
    for o in store_orders('preparing', int(n(40))):
        if R.random() < min(1, 0.12 * speed):
            set_status(o, 'ready')
            delivery = o['delivery_option'] == 'entrega'
            owner_say(o['buyer_id'], R.choice((AFTER_READY_COURIER if CFG['couriers'] else AFTER_READY_DELIVERY) if delivery else AFTER_READY_PICKUP))
            log(f"  🏪 pedido {o['id'][:8]} pronto → {('aguardando o motoboy' if CFG['couriers'] else 'saiu para entrega') if delivery else 'aguardando retirada'}")
    for o in store_orders('ready', int(n(30))):
        if CFG['couriers'] and o['delivery_option'] == 'entrega' and (float(o['age']) < 900 or q_local(f"select 1 from ride_requests where order_id = {esc(o['id'])}::uuid and status in ('pending','accepted') limit 1")):
            continue   # a entrega é com o motorista (se ficar parado 15 min sem ninguém, a loja finaliza por aqui — nunca com uma corrida viva)
        if R.random() < min(1, 0.14 * speed):
            set_status(o, 'paid')
            if R.random() < 0.7:
                say(o['buyer_id'], o['buyer_id'], R.choice(AFTER_PAID_CUSTOMER))
            log(f"  📦 pedido {o['id'][:8]} entregue (R$ {float(o['total_amount']):.2f})".replace('.', ','))
    # o cliente recebeu: comenta/avalia a compra
    rows = q_local(f"""select o.id, o.checkout_id, o.buyer_id, (select oi.product_id from order_items oi where oi.order_id = o.id order by oi.total_price desc limit 1) as product_id
        from orders o where o.store_id = {esc(STORE['id'])}::uuid and o.status = 'paid' and o.updated_at < now() - interval '{int(n(12))} seconds' and o.updated_at > now() - interval '3 hours'
          and not exists (select 1 from product_reviews r where r.order_id = o.checkout_id and r.profile_id = o.buyer_id) order by random() limit 4""")
    for r in rows:
        if R.random() > min(1, 0.3 * speed):
            continue
        rating = R.choices([5, 4, 3, 2], [62, 25, 10, 3])[0]
        text = R.choice(REVIEWS_GOOD if rating >= 4 else REVIEWS_OK) or None
        as_user(r['buyer_id'], f"""insert into product_reviews (store_id, product_id, profile_id, order_id, rating, comment, is_anonymous)
            values ({esc(STORE['id'])}::uuid, {esc(r['product_id'])}::uuid, {esc(r['buyer_id'])}::uuid, {esc(r['checkout_id'])}::uuid, {rating}, {esc(text) if text else 'null'}, false);""")
        log(f"  ⭐ cliente avaliou o pedido {r['id'][:8]} com {rating}★" + (f" — “{text[:50]}”" if text else ''))


def attend_appointments(speed):
    """Agendamentos: a loja confirma (a entrada Pix informada é confirmada) e, passado o dia, marca o serviço como feito."""
    rows = q_local(f"""select a.id, a.status, a.deposit_status, a.customer_id, a.service_name from appointments a
        where a.store_id = {esc(STORE['id'])}::uuid and a.status = 'pending' and a.created_at < now() - interval '150 seconds' order by random() limit 3""")
    for r in rows:   # dá tempo da pessoa aceitar o pedido de serviço à mão; se ela não aceitar, a loja aceita
        if R.random() > min(1, 0.08 * speed):
            continue
        try:
            if r['deposit_status'] == 'reported':
                as_user(STORE['owner_id'], f"select confirm_appointment_deposit({esc(r['id'])}::uuid);")
                log(f"  📅 entrada confirmada → agendamento “{r['service_name']}” confirmado")
                owner_say(r['customer_id'], f"Recebemos a entrada! Sua reserva de “{r['service_name']}” está confirmada. Te esperamos! 🍕")
            elif r['deposit_status'] in ('none', None):
                as_user(STORE['owner_id'], f"update appointments set status = 'confirmed' where id = {esc(r['id'])}::uuid;")
                log(f"  📅 agendamento “{r['service_name']}” confirmado")
        except Exception as e:  # noqa: BLE001
            log(f"  ✗ agendamento {r['id'][:8]}: {str(e).splitlines()[0][:100]}")


SERVICE_REVIEWS = ['Ambiente VIP impecável, atendimento nota 10!', 'O rodízio é muito bom, pizza saindo toda hora.', 'Fizemos o aniversário aqui, todo mundo adorou.', 'Valeu cada centavo, voltaremos.', 'Garçom atencioso e salão lindo.', 'Poderia ter mais variedade de doces, mas tudo ótimo.', '']


def attend_service_cycle(speed):
    """Serviço pedido: o cliente informa a entrada que faltava; o que está na agenda é marcado como feito e o cliente avalia o serviço."""
    for r in q_local(f"""select a.id, a.customer_id from appointments a where a.store_id = {esc(STORE['id'])}::uuid and a.status = 'pending' and a.deposit_status = 'awaiting'
                         and a.created_at < now() - interval '60 seconds' order by random() limit 2"""):
        if R.random() < min(1, 0.3 * speed):
            as_user(r['customer_id'], f"select report_appointment_deposit({esc(r['id'])}::uuid);")
            log('  💸 cliente informou a entrada do agendamento')
    for r in q_local(f"""select a.id, a.customer_id, a.service_name from appointments a where a.store_id = {esc(STORE['id'])}::uuid and a.status = 'confirmed'
                         and a.updated_at < now() - interval '6 minutes' order by random() limit 2"""):   # fica na agenda uns minutos antes de ser feito
        if R.random() > min(1, 0.06 * speed):
            continue
        try:
            as_user(STORE['owner_id'], f"select complete_appointment({esc(r['id'])}::uuid);")
            stars = R.choices([5, 4, 3], [65, 28, 7])[0]
            as_user(r['customer_id'], f"select submit_appointment_review({esc(r['id'])}::uuid, {stars}, {esc(R.choice(SERVICE_REVIEWS))});")
            log(f"  ⭐ serviço “{r['service_name']}” feito e avaliado com {stars}★")
        except Exception as e:  # noqa: BLE001
            log(f"  ✗ serviço {r['id'][:8]}: {str(e).splitlines()[0][:100]}")


# ---------------------------------------------------------------- motoboys: levar o MÁXIMO que dá numa saída
def hav_km(a, b):
    r = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(min(1, math.sqrt(h)))


def nearest_route(stops):
    """Ordem de entrega: do mais perto da loja, sempre indo ao próximo mais perto do ponto atual."""
    left, here, out = list(stops), STORE_POS, []
    while left:
        nxt = min(left, key=lambda o: hav_km(here, (float(o['delivery_lat']), float(o['delivery_lng']))))
        out.append(nxt)
        here = (float(nxt['delivery_lat']), float(nxt['delivery_lng']))
        left.remove(nxt)
    return out


def dispatch_batches(speed=1.0):
    """Motoboy livre + pedidos prontos de entrega: monta a saída com o máximo que cabe na mochila e fica perto entre si."""
    busy = {r['employee_id'] for r in q_local(f"select distinct employee_id from delivery_assignments where store_id = {esc(STORE['id'])}::uuid and status in ('pending','in_transit')")}
    idle = [c for c in COURIERS if c['id'] not in busy]
    if not idle:
        return
    ready = q_local(f"""select o.id, o.checkout_id, o.buyer_id, o.delivery_lat, o.delivery_lng, extract(epoch from now() - o.updated_at) as age,
        (select coalesce(sum(case when p.category in ('Pizzas tradicionais','Pizzas especiais','Pizzas doces','Promoções') then oi.quantity else 0.25 * oi.quantity end), 1)
           from order_items oi left join products p on p.id = oi.product_id where oi.order_id = o.id) as units
        from orders o where o.store_id = {esc(STORE['id'])}::uuid and o.status = 'ready' and o.delivery_option = 'entrega' and o.delivery_lat is not null
          and not exists (select 1 from delivery_assignments da where da.checkout_id = o.checkout_id) order by o.updated_at""")
    coming = q_local(f"select count(*) as n from orders where store_id = {esc(STORE['id'])}::uuid and status in ('pending','preparing') and delivery_option = 'entrega'")[0]['n']
    for courier in idle:
        if not ready:
            break
        seed = ready[0]
        pos = lambda o: (float(o['delivery_lat']), float(o['delivery_lng']))
        batch, units = [seed], float(seed['units'])
        for o in sorted(ready[1:], key=lambda o: hav_km(pos(seed), pos(o))):
            if len(batch) >= CFG['max_stops'] or units + float(o['units']) > CFG['bag']:
                continue
            if hav_km(pos(seed), pos(o)) > CFG['reach']:
                break
            batch.append(o); units += float(o['units'])
        full = units >= CFG['bag'] * 0.8 or len(batch) >= CFG['max_stops']
        waited = float(seed['age']) >= CFG['wait'] / max(1.0, 1.0)
        nothing_more = int(coming) == 0 and float(seed['age']) >= CFG['wait'] / 4
        if not (full or waited or nothing_more):
            continue   # vale esperar: tem mais pedido a caminho de ficar pronto e a mochila ainda tem espaço
        route = nearest_route(batch)
        vals = ','.join(f"({esc(STORE['id'])}::uuid, {esc(courier['id'])}::uuid, {esc(o['checkout_id'])}::uuid, {i + 1}, 'pending')" for i, o in enumerate(route))
        as_user(STORE['owner_id'], f"insert into delivery_assignments (store_id, employee_id, checkout_id, sequence_order, status) values {vals};")
        km = 0.0; here = STORE_POS
        for o in route:
            km += hav_km(here, pos(o)); here = pos(o)
        log(f"  🛵 {courier['name']} vai sair com {len(route)} entrega(s) ({units:.1f}/{CFG['bag']:g} na mochila, ~{km:.1f} km de rota): " + ' → '.join(o['id'][:6] for o in route))
        ready = [o for o in ready if o not in batch]


def courier_status(courier, assignment_id, status):
    """O motoboy marca peguei/entreguei pelo MESMO endpoint da página /entregador/<token> (se o app não responder, grava direto no banco)."""
    try:
        req = urllib.request.Request(f"{CFG['app']}/api/courier/{courier['access_token']}/status", data=json.dumps({'assignmentId': assignment_id, 'status': status}).encode(),
                                     headers={'Content-Type': 'application/json'}, method='POST')
        urllib.request.urlopen(req, timeout=8).read()
    except Exception as e:  # noqa: BLE001
        stamp = "picked_up_at = coalesce(picked_up_at, now())" if status == 'in_transit' else "picked_up_at = coalesce(picked_up_at, now()), delivered_at = now()"
        psql(['-c', f"update delivery_assignments set status = {esc(status)}, {stamp} where id = {esc(assignment_id)}::uuid"])
        log(f"  (app não respondeu — {str(e)[:50]} — gravei direto no banco)")


def run_couriers(speed=1.0):
    rows = q_local(f"""select da.id, da.employee_id, da.sequence_order, da.status, da.created_at::text as created,
        extract(epoch from now() - da.created_at) as since_assign, extract(epoch from now() - da.picked_up_at) as since_pick,
        o.id as order_id, o.buyer_id, o.delivery_lat, o.delivery_lng, o.total_amount, o.status as order_status
        from delivery_assignments da join orders o on o.checkout_id = da.checkout_id
        where da.store_id = {esc(STORE['id'])}::uuid and da.status in ('pending','in_transit') order by da.employee_id, da.sequence_order""")
    by = {}
    for r in rows:
        by.setdefault(r['employee_id'], []).append(r)
    for emp_id, stops in by.items():
        courier = next((c for c in COURIERS if c['id'] == emp_id), None)
        if not courier:
            continue
        pending = [s for s in stops if s['status'] == 'pending']
        if pending:   # ainda na loja: carrega a mochila e sai com todos de uma vez
            if min(float(s['since_assign']) for s in pending) >= CFG['load'] / CFG['scale'] and all(s['order_status'] == 'ready' for s in pending):
                for s in pending:
                    courier_status(courier, s['id'], 'in_transit')
                    owner_say(s['buyer_id'], f"Seu pedido saiu para entrega com {courier['name']}! 🛵")
                log(f"  🛵 {courier['name']} pegou {len(pending)} pedido(s) e saiu para entregar")
            continue
        nxt = stops[0]   # todos já a caminho: o próximo da rota
        done = q_local(f"""select da.sequence_order, extract(epoch from now() - da.delivered_at) as since, o.delivery_lat, o.delivery_lng from delivery_assignments da join orders o on o.checkout_id = da.checkout_id
            where da.employee_id = {esc(emp_id)}::uuid and da.status = 'delivered' and da.created_at = {esc(nxt['created'])}::timestamptz order by da.sequence_order desc limit 1""")
        prev_pos, waited = (STORE_POS, float(nxt['since_pick'])) if not done else ((float(done[0]['delivery_lat']), float(done[0]['delivery_lng'])), float(done[0]['since']))
        leg = max(8.0, hav_km(prev_pos, (float(nxt['delivery_lat']), float(nxt['delivery_lng']))) / 28.0 * 3600.0 / CFG['scale'])   # ~28 km/h de moto na cidade, relógio comprimido
        if waited < leg:
            continue
        courier_status(courier, nxt['id'], 'delivered')
        as_user(STORE['owner_id'], f"update orders set status = 'paid' where id = {esc(nxt['order_id'])}::uuid;")
        owner_say(nxt['buyer_id'], 'Entregue! Bom apetite. 🍕')
        if R.random() < 0.8:
            say(nxt['buyer_id'], nxt['buyer_id'], R.choice(AFTER_PAID_CUSTOMER))
        log(f"  📦 {courier['name']} entregou o pedido {nxt['order_id'][:8]} (R$ {float(nxt['total_amount']):.2f}) — faltam {len(stops) - 1} na rota".replace('.', ','))


# ---------------------------------------------------------------- motoristas iUSER: aceitam se quiserem, dentro da mochila, e entregam pelo app
def is_manual(d):
    """Motorista conduzido pelas telas (TEATRO) e não pelo simulador: '*' = todos."""
    return '*' in CFG['manual_drivers'] or d['key'] in CFG['manual_drivers']


def drv_pos(d):
    st = DRV.setdefault(d['id'], {})
    if 'pos' not in st:
        r = q_local(f"select live_lat, live_lng from driver_pricing where driver_id = {esc(d['id'])}::uuid")
        st['pos'] = (float(r[0]['live_lat']), float(r[0]['live_lng'])) if r and r[0]['live_lat'] is not None else STORE_POS
    return st['pos']


def drv_move(d, to):
    """O motorista anda: a posição ao vivo dele (a que a loja e o cliente veem) passa a ser a do ponto novo."""
    DRV.setdefault(d['id'], {})['pos'] = to
    psql(['-c', f"update driver_pricing set live_lat = {to[0]}, live_lng = {to[1]}, live_updated_at = now() where driver_id = {esc(d['id'])}::uuid"])


def drv_rides(d):
    return q_local(f"""select r.id, r.order_id, r.recipient_name, r.destination_lat, r.destination_lng, r.origin_lat, r.origin_lng, r.offered_price,
        r.driver_en_route, r.driver_arrived_at, r.ride_started_at, extract(epoch from now() - r.created_at) as age, o.status as order_status, o.buyer_id
        from ride_requests r join orders o on o.id = r.order_id
        where r.driver_id = {esc(d['id'])}::uuid and r.status = 'accepted' and o.store_id = {esc(STORE['id'])}::uuid order by r.created_at""")


def drop_stale_rides():
    """Entrega de pedido que já foi encerrado por outro caminho (finalizado/recusado) não serve mais: sai da lista e da mochila de todos."""
    psql(['-c', f"""update ride_requests r set status = 'cancelled', cancelled_by = 'requester' from orders o
        where o.id = r.order_id and o.store_id = {esc(STORE['id'])}::uuid and r.status in ('pending','accepted') and o.status in ('paid','rejected','cancelled')"""])


def drivers_accept(speed=1.0):
    """Cada motorista online olha as entregas abertas e aceita as que quiser (disposição própria), se couber na mochila e ficar perto das que já pegou."""
    drop_stale_rides()
    offers = q_local(f"""select r.id, r.destination_lat, r.destination_lng, r.offered_price, r.recipient_name, extract(epoch from now() - r.created_at) as age, o.buyer_id
        from ride_requests r join orders o on o.id = r.order_id where r.status = 'pending' and r.driver_id is null and o.store_id = {esc(STORE['id'])}::uuid order by r.created_at""")
    if CFG['stage'] and FEATURED:   # no TEATRO a entrega da cliente em destaque espera um tempo pelo motorista que está na tela (Dani)
        offers = [o for o in offers if not (o['buyer_id'] == FEATURED['id'] and float(o['age']) < CFG['stage_grace'])]
    if not offers:
        return
    for d in sorted(IUSER_DRIVERS, key=lambda _d: R.random()):
        if is_manual(d):
            continue
        mine = drv_rides(d)
        if any(m['ride_started_at'] for m in mine) or len(mine) >= int(d['cap']):
            continue
        mine_pts = [(float(m['destination_lat']), float(m['destination_lng'])) for m in mine]
        for o in offers:
            if len(mine) >= int(d['cap']):
                break
            if o.get('taken'):
                continue
            if float(o['age']) < R.uniform(3, 14) / max(CFG.get('scale', 1), 1):   # leva uns segundos para olhar a entrega nova
                continue
            if mine_pts and min(hav_km(mine_pts[0], (float(o['destination_lat']), float(o['destination_lng']))), 99) > CFG['reach']:
                continue
            if R.random() > EAGER.get(d['key'], 0.6):
                continue
            try:
                as_user(d['id'], f"insert into ride_applications (ride_request_id, applicant_id, proposed_price) values ({esc(o['id'])}::uuid, {esc(d['id'])}::uuid, {o['offered_price']});")
            except Exception as e:  # noqa: BLE001
                msg = str(e)
                if 'delivery_capacity_full' in msg or 'mochila' in msg.lower():
                    break
                continue   # outro motorista chegou antes, ou o banco recusou
            o['taken'] = True
            mine.append(o); mine_pts.append((float(o['destination_lat']), float(o['destination_lng'])))
            log(f"  🛵 {d['name']} aceitou a entrega para {o['recipient_name'] or 'cliente'} (R$ {float(o['offered_price']):.2f}; mochila {len(mine)}/{d['cap']})".replace('.', ','))


def drivers_run(speed=1.0):
    """Quem aceitou: vai à loja, espera o pedido ficar pronto, pega todos de uma vez e entrega um por um (o mais perto primeiro)."""
    sc = CFG['scale']
    for d in IUSER_DRIVERS:
        if is_manual(d):
            continue
        rides = drv_rides(d)
        if not rides:
            DRV.setdefault(d['id'], {}).pop('left', None)
            continue
        st = DRV.setdefault(d['id'], {})
        ids = ','.join(esc(r['id']) + '::uuid' for r in rides)
        started = [r for r in rides if r['ride_started_at']]
        if not started:
            if not rides[0]['driver_en_route']:
                if time.time() - st.setdefault('accepted_at', time.time()) < CFG['wait'] / 3 / sc * 2:
                    continue   # junta mais uma entrega antes de sair, se aparecer
                psql(['-c', f"update ride_requests set driver_en_route = true, driver_departed_at = now() where id in ({ids})"])
                st['left'] = time.time()
                log(f"  🛵 {d['name']} saiu para a loja ({len(rides)} entrega(s) aceita(s))")
                continue
            if not rides[0]['driver_arrived_at']:
                trip = max(6.0, hav_km(drv_pos(d), STORE_POS) / 28.0 * 3600.0 / sc)
                if time.time() - st.setdefault('left', time.time()) < trip:
                    continue
                drv_move(d, STORE_POS)
                psql(['-c', f"update ride_requests set driver_arrived_at = now() where id in ({ids})"])
                st['arrived'] = time.time()
                log(f"  🛵 {d['name']} chegou na loja e espera o pedido")
                continue
            if all(r['order_status'] == 'ready' for r in rides) and time.time() - st.get('arrived', 0) >= CFG['load'] / sc:
                code = q_local(f"select code from delivery_pickup_codes where store_id = {esc(STORE['id'])}::uuid and driver_id = {esc(d['id'])}::uuid and used_at is null")   # a loja conferiu e informou o código
                out = as_user(d['id'], f"select confirm_pickup(array[{ids.replace('::uuid', '')}]::uuid[], {esc(code[0]['code'] if code else '')});")
                if '"ok": true' not in out:
                    log(f"  ✗ {d['name']}: retirada recusada")
                    continue
                for r in rides:
                    owner_say(r['buyer_id'], f"Seu pedido saiu para entrega com {d['name']}! 🛵")
                st['last_leg'] = time.time()
                log(f"  🛵 {d['name']} pegou {len(rides)} pedido(s) e saiu para entregar")
            continue
        # entregando: o próximo é o mais perto de onde está
        here = drv_pos(d)
        nxt = min(started, key=lambda r: hav_km(here, (float(r['destination_lat']), float(r['destination_lng']))))
        dest = (float(nxt['destination_lat']), float(nxt['destination_lng']))
        leg = max(8.0, hav_km(here, dest) / 28.0 * 3600.0 / sc)
        if time.time() - st.setdefault('last_leg', time.time()) < leg:
            continue
        drv_move(d, dest)
        as_user(d['id'], f"select complete_ride({esc(nxt['id'])}::uuid, {dest[0]}, {dest[1]});")
        st['last_leg'] = time.time()
        owner_say(nxt['buyer_id'], 'Entregue! Bom apetite. 🍕')
        if R.random() < 0.8:
            say(nxt['buyer_id'], nxt['buyer_id'], R.choice(AFTER_PAID_CUSTOMER))
        log(f"  📦 {d['name']} entregou para {nxt['recipient_name'] or 'cliente'} (R$ {float(nxt['offered_price']):.2f}) — faltam {len(started) - 1} na mochila".replace('.', ','))


DRIVER_REVIEWS_GOOD = ['Entregou rápido e com cuidado, a pizza chegou quentinha!', 'Muito educado(a) e pontual.', 'Ótimo entregador, recomendo.', 'Chegou antes do esperado.', 'Cuidadoso com os pedidos, nenhuma caixa virou.', 'Atencioso e rápido, nota 10.', '']
DRIVER_REVIEWS_OK = ['Entregou, mas demorou um pouco mais que o combinado.', 'Tudo certo, só poderia ter avisado ao chegar.']


def rate_deliveries(speed=1.0, everything=False):
    """A loja (quem pediu a corrida) avalia o motorista iUser que entregou; `everything` avalia de uma vez todas as pendentes (e as compras sem avaliação)."""
    if CFG['stage'] and not everything:
        return   # no TEATRO é o dono (na tela) que avalia o motorista
    where = "" if everything else "and r.ride_started_at > now() - interval '3 hours'"
    rows = q_local(f"""select r.id, r.driver_id, r.requester_id, p.name as driver_name from ride_requests r join orders o on o.id = r.order_id join profiles p on p.id = r.driver_id
        where r.status = 'completed' and o.store_id = {esc(STORE['id'])}::uuid {where}
          and not exists (select 1 from ride_reviews v where v.ride_request_id = r.id and v.reviewer_id = r.requester_id) order by r.ride_started_at limit {500 if everything else 4}""")
    for r in rows:
        if not everything and R.random() > min(1, 0.4 * speed):
            continue
        rating = R.choices([5, 4, 3, 2], [66, 24, 8, 2])[0]
        text = R.choice(DRIVER_REVIEWS_GOOD if rating >= 4 else DRIVER_REVIEWS_OK) or None
        try:
            as_user(r['requester_id'], f"insert into ride_reviews (ride_request_id, reviewer_id, reviewee_id, rating, comment) values ({esc(r['id'])}::uuid, {esc(r['requester_id'])}::uuid, {esc(r['driver_id'])}::uuid, {rating}, {esc(text) if text else 'null'});")
            log(f"  ⭐ a loja avaliou {r['driver_name']} com {rating}★" + (f" — “{text[:50]}”" if text else ''))
        except Exception as e:  # noqa: BLE001
            log(f"  ✗ avaliação da corrida {r['id'][:8]}: {str(e).splitlines()[0][:100]}")


def review_pending_orders():
    """Todas as compras já entregues e ainda sem avaliação ganham a do cliente (para ver o fluxo completo de uma vez)."""
    rows = q_local(f"""select o.id, o.checkout_id, o.buyer_id, (select oi.product_id from order_items oi where oi.order_id = o.id order by oi.total_price desc limit 1) as product_id
        from orders o where o.store_id = {esc(STORE['id'])}::uuid and o.status = 'paid' and not exists (select 1 from product_reviews r where r.order_id = o.checkout_id and r.profile_id = o.buyer_id) limit 500""")
    for r in rows:
        rating = R.choices([5, 4, 3, 2], [62, 25, 10, 3])[0]
        text = R.choice(REVIEWS_GOOD if rating >= 4 else REVIEWS_OK) or None
        try:
            as_user(r['buyer_id'], f"""insert into product_reviews (store_id, product_id, profile_id, order_id, rating, comment, is_anonymous)
                values ({esc(STORE['id'])}::uuid, {esc(r['product_id'])}::uuid, {esc(r['buyer_id'])}::uuid, {esc(r['checkout_id'])}::uuid, {rating}, {esc(text) if text else 'null'}, false);""")
            log(f"  ⭐ cliente avaliou o pedido {r['id'][:8]} com {rating}★" + (f" — “{text[:50]}”" if text else ''))
        except Exception as e:  # noqa: BLE001
            log(f"  ✗ avaliação do pedido {r['id'][:8]}: {str(e).splitlines()[0][:100]}")


def review_featured(speed=1.0):
    """A cliente em destaque (Gabriela) avalia TODO pedido entregue dela, de qualquer loja, logo depois de receber — a lista de pendentes não cresce."""
    if not FEATURED or CFG['stage']:
        return   # no TEATRO é a tela da cliente que avalia, com o toque dela
    rows = q_local(f"""select o.id, o.checkout_id, o.store_id, s.name as sname, (select oi.product_id from order_items oi where oi.order_id = o.id order by oi.total_price desc limit 1) as product_id
        from orders o join stores s on s.id = o.store_id where o.buyer_id = {esc(FEATURED['id'])}::uuid and o.status = 'paid' and o.updated_at < now() - interval '6 seconds'
          and not exists (select 1 from product_reviews r where r.order_id = o.checkout_id and r.profile_id = o.buyer_id) order by o.updated_at limit 30""")
    for r in rows:
        if not r['product_id']:
            continue
        rating = R.choices([5, 4, 3], [65, 28, 7])[0]
        text = R.choice(REVIEWS_GOOD if rating >= 4 else REVIEWS_OK) or None
        try:
            as_user(FEATURED['id'], f"""insert into product_reviews (store_id, product_id, profile_id, order_id, rating, comment, is_anonymous)
                values ({esc(r['store_id'])}::uuid, {esc(r['product_id'])}::uuid, {esc(FEATURED['id'])}::uuid, {esc(r['checkout_id'])}::uuid, {rating}, {esc(text) if text else 'null'}, false);""")
            log(f"  ⭐ {FEATURED['name'].split()[0]} avaliou {r['sname']} ({r['id'][:6]}) com {rating}★")
        except Exception as e:  # noqa: BLE001
            log(f"  ✗ avaliação da {FEATURED['name'].split()[0]}: {str(e).splitlines()[0][:100]}")


def rate_everything():
    rate_deliveries(everything=True)
    review_pending_orders()


def stage_mover():
    """TEATRO: a Dani anda de verdade — a posição ao vivo dela vai da posição atual até o próximo ponto (a loja; depois cada parada), em passos de 1 s."""
    dani = next((d for d in IUSER_DRIVERS if d['key'] in CFG['manual_drivers']), None)
    if not dani:
        return
    rides = drv_rides(dani)
    if not rides:
        return
    started = [r for r in rides if r['ride_started_at']]
    if not rides[0]['driver_en_route'] and not started:
        return
    here = drv_pos(dani)
    if started:
        nxt = min(started, key=lambda r: hav_km(here, (float(r['destination_lat']), float(r['destination_lng']))))
        target = (float(nxt['destination_lat']), float(nxt['destination_lng']))
    elif not rides[0]['driver_arrived_at']:
        target = STORE_POS
    else:
        target = STORE_POS
    d = hav_km(here, target)
    step = CFG['stage_speed'] * 28.0 / 3600.0   # km por segundo
    if d <= step or d < 0.01:
        if d > 0.003:
            drv_move(dani, target)
        return
    k = step / d
    drv_move(dani, (here[0] + (target[0] - here[0]) * k, here[1] + (target[1] - here[1]) * k))


def featured_order():
    """A cliente em destaque (a que a página /tres-telas acompanha) pede com frequência, sempre entrega."""
    if FEATURED and not CFG['stage']:
        make_order(FEATURED, force_delivery=True)


def cycle_tick(speed):
    fns = [attend_orders, attend_appointments, attend_service_cycle, review_featured]
    if CFG['mode'] == 'iuser':
        fns += [drivers_accept, drivers_run, rate_deliveries]
    elif CFG['couriers']:
        fns += [dispatch_batches, run_couriers]
    for fn in fns:
        try:
            fn(speed)
        except Exception as e:  # noqa: BLE001
            log(f"  ✗ {fn.__name__}: {str(e).splitlines()[0][:140]}")
    safe(chat_tick)



def safe(fn):
    try:
        fn()
    except Exception as e:  # noqa: BLE001
        log(f"  ✗ {fn.__name__}: {str(e).splitlines()[0][:140]}")


def loop(every, fn, stop):
    def run():
        while not stop.is_set():
            safe(fn)
            stop.wait(every * R.uniform(0.9, 1.1))
    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--burst', type=int, default=6, help='pedidos feitos de uma vez ao começar')
    ap.add_argument('--every', type=float, default=12, help='segundos entre um pedido e o próximo')
    ap.add_argument('--appts-every', type=float, default=40, help='segundos entre um pedido de serviço (agendamento) e o próximo')
    ap.add_argument('--chat-every', type=float, default=15, help='segundos entre uma pergunta de cliente e a próxima')
    ap.add_argument('--speed', type=float, default=1.0, help='multiplicador do ritmo do atendimento (2 = o dobro de rápido)')
    ap.add_argument('--manual', action='store_true', help='só chegam pedidos e agendamentos; quem atende (e responde) é a pessoa, pelo app')
    ap.add_argument('--bag', type=float, default=6.0, help='quanto cabe na mochila do motoboy (uma pizza = 1; bebida/porção = 0,25)')
    ap.add_argument('--max-stops', type=int, default=5, help='no máximo quantas entregas numa saída')
    ap.add_argument('--reach', type=float, default=3.5, help='km: só junta pedidos até essa distância do primeiro da rota')
    ap.add_argument('--wait', type=float, default=45.0, help='segundos que o pedido pronto espera para juntar mais entregas antes de sair')
    ap.add_argument('--load', type=float, default=20.0, help='segundos (do relógio comprimido) que o motoboy leva para carregar a mochila')
    ap.add_argument('--time-scale', type=float, default=6.0, help='comprime o relógio das viagens (6 = 6x mais rápido que a vida real)')
    ap.add_argument('--featured-every', type=float, default=55.0, help='segundos entre um pedido e outro da cliente em destaque (cliente-007)')
    ap.add_argument('--employees', action='store_true', help='usa os motoboys da loja (tabela employees) em vez dos motoristas iUser')
    ap.add_argument('--manual-drivers', default='', help='motoristas iUser que NÃO são simulados (a pessoa mexe na mão em /entregas), ex.: dani,leo')
    ap.add_argument('--stage', action='store_true', help='TEATRO: a Dani (motorista), a Gabriela (cliente) e o dono são conduzidos pelas telas de /tres-telas; o simulador não atende os pedidos dela nem a corrida da Dani')
    ap.add_argument('--stage-speed', type=float, default=5.0, help='TEATRO: velocidade da Dani no mapa (5 = 5x a de uma moto na cidade)')
    ap.add_argument('--no-couriers', action='store_true', help='sem motoboys: entrega vai direto de pronto para entregue')
    ap.add_argument('--once', choices=['order', 'appointment', 'chat', 'tick', 'featured', 'rate'])
    a = ap.parse_args()
    CFG.update(mode='none' if a.no_couriers else ('employees' if a.employees else 'iuser'), manual_drivers=[x.strip() for x in a.manual_drivers.split(',') if x.strip()] or (['*'] if a.stage else []), stage=a.stage, stage_speed=a.stage_speed, couriers=not a.no_couriers, bag=a.bag, max_stops=a.max_stops, reach=a.reach, wait=a.wait, load=a.load, scale=a.time_scale)
    load()
    if a.once:
        return safe({'order': make_order, 'appointment': make_appointment, 'chat': customer_asks, 'tick': lambda: cycle_tick(a.speed), 'featured': featured_order, 'rate': lambda: (rate_everything(), review_featured())}[a.once])
    log(f"{STORE['name']}: {len(GOODS)} produtos, {len(SERVICES)} serviços, {len(CUSTOMERS)} clientes. " + ('Os pedidos chegam como PENDENTES — quem atende é você.' if a.manual else 'A loja atende sozinha: aceita, prepara, ' + (f"os motoristas iUser pegam as entregas ({', '.join(d['name'].split()[0] + ' ' + str(d['cap']) for d in IUSER_DRIVERS)}; mochila = entregas ao mesmo tempo)" if CFG['mode'] == 'iuser' else f"manda os motoboys ({len(COURIERS)}; mochila {CFG['bag']:g}, até {CFG['max_stops']} entregas por saída)" if CFG['couriers'] else 'entrega') + ', responde e o cliente avalia.'))
    for _ in range(a.burst):
        safe(make_order)
        time.sleep(0.4)
    for _ in range(3):
        safe(make_appointment)
    stop = threading.Event()
    loop(a.every, make_order, stop)
    loop(a.appts_every, make_appointment, stop)
    loop(a.featured_every, featured_order, stop)
    if a.stage:
        log('TEATRO ligado: os motoristas, a Gabriela e o dono agem pelas telas (/tres-telas); o simulador cuida do resto da cidade.')
    if not a.manual:
        loop(a.chat_every, customer_asks, stop)
        loop(5, lambda: cycle_tick(a.speed), stop)
    try:
        while True:
            time.sleep(60)
            if R.random() < 0.2:
                load()
    except KeyboardInterrupt:
        stop.set()
        log('parado.')


if __name__ == '__main__':
    main()
