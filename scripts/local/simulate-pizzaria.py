#!/usr/bin/env python3
"""Movimento da Pizzaria Forno de Ouro (conta admin-teste) — SÓ no Supabase LOCAL. CICLO COMPLETO, do pedido à avaliação.

Clientes de teste agem COMO ELES MESMOS (papel `authenticated` + JWT: RLS, gatilhos e RPCs valem) e a loja (a conta admin-teste, também como ela
mesma) atende:
  - PEDIDOS: chegam a cada --every s (pizzas com adicionais, entrega/retirada, Pix/cartão/dinheiro) e AGENDAMENTOS (rodízio, Ambiente VIP) a cada --appts-every s;
  - CONVERSAS: clientes puxam conversa com a loja (entrega no bairro, ingredientes, horário do rodízio, reserva do Ambiente VIP, tempo do pedido) e a
    loja responde; a loja também avisa em cada etapa do pedido e o cliente agradece;
  - ATENDIMENTO: pedido pendente → a loja aceita (ou recusa, raramente) → em preparo → pronto / saiu para entrega → entregue (pago) → o cliente
    recebe, comenta no chat e AVALIA a compra; agendamentos pendentes são confirmados (entrada Pix confirmada) e, no dia, marcados como feitos.
  Com --manual só chegam pedidos/agendamentos (nada é atendido): quem atende é a pessoa, pelo app.
O simulador do ecossistema (simulate-ecosystem.py) NÃO mexe nessa loja.

  node scripts/local/seed-pizzaria.mjs                       # (uma vez) cria a loja, o cardápio e os serviços
  python3 -u scripts/local/simulate-pizzaria.py              # ciclo completo (Ctrl-C para parar)
  python3 -u scripts/local/simulate-pizzaria.py --burst 0 --every 30 --appts-every 120 --speed 1
  python3 -u scripts/local/simulate-pizzaria.py --manual     # só chegam pedidos; você atende
  python3 scripts/local/simulate-pizzaria.py --once order    # só um pedido (ou: --once appointment | chat | tick)
"""
import argparse, json, os, random, re, sys, threading, time
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
CUSTOMERS = []
GOODS = []
ADDONS = {}
SERVICES = []


def load():
    global STORE, CUSTOMERS, GOODS, ADDONS, SERVICES
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


def make_order():
    c = R.choice(CUSTOMERS)
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
    deliver = R.random() < 0.65
    pay = R.choice(['pix', 'pix', 'cartao', 'cartao', 'dinheiro'])
    street, lat, lng = R.choice(STREETS)
    addr = f"{street}, {R.randint(100, 2500)}, Porto Velho - RO" if deliver else 'null'
    change = 'null'
    if pay == 'dinheiro':
        change = R.choice(['100', '100', '200', '50'])
    contactless = 'true' if pay == 'cartao' and R.random() < 0.5 else ('false' if pay == 'cartao' else 'null')
    sql = (f"select create_store_order({esc(STORE['id'])}::uuid, {esc(json.dumps(items))}::jsonb, {esc('entrega' if deliver else 'retirada')}, {esc(pay)}, "
           f"{esc(addr) if deliver else 'null'}, {lat if deliver else 'null'}, {lng if deliver else 'null'}, {change}, {contactless}, null, gen_random_uuid());")
    d = json.loads(last_line(as_user(c['id'], sql)))
    total = float(d['total_amount'])
    log(f"🍕 pedido de {c['name']}: {len(items)} item(ns), {'entrega' if deliver else 'retirada'}, {pay} — R$ {total:.2f}".replace('.', ','))


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
    return q_local(f"""select o.id, o.buyer_id, o.delivery_option, o.total_amount, extract(epoch from now() - o.updated_at) as age from orders o
        where o.store_id = {esc(STORE['id'])}::uuid and o.status = {esc(status)} and o.updated_at < now() - interval '{min_age} seconds' order by o.updated_at limit 12""")


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
            owner_say(o['buyer_id'], R.choice(AFTER_READY_DELIVERY if delivery else AFTER_READY_PICKUP))
            log(f"  🏪 pedido {o['id'][:8]} pronto → {'saiu para entrega' if delivery else 'aguardando retirada'}")
    for o in store_orders('ready', int(n(30))):
        if R.random() < min(1, 0.14 * speed):
            set_status(o, 'paid')
            if R.random() < 0.7:
                say(o['buyer_id'], o['buyer_id'], R.choice(AFTER_PAID_CUSTOMER))
            log(f"  📦 pedido {o['id'][:8]} entregue (R$ {float(o['total_amount']):.2f})".replace('.', ','))
    # o cliente recebeu: comenta/avalia a compra
    rows = q_local(f"""select o.id, o.buyer_id, (select oi.product_id from order_items oi where oi.order_id = o.id order by oi.total_price desc limit 1) as product_id
        from orders o where o.store_id = {esc(STORE['id'])}::uuid and o.status = 'paid' and o.updated_at < now() - interval '{int(n(12))} seconds' and o.updated_at > now() - interval '3 hours'
          and not exists (select 1 from product_reviews r where r.order_id = o.id) order by random() limit 4""")
    for r in rows:
        if R.random() > min(1, 0.3 * speed):
            continue
        rating = R.choices([5, 4, 3, 2], [62, 25, 10, 3])[0]
        text = R.choice(REVIEWS_GOOD if rating >= 4 else REVIEWS_OK) or None
        as_user(r['buyer_id'], f"""insert into product_reviews (store_id, product_id, profile_id, order_id, rating, comment, is_anonymous)
            values ({esc(STORE['id'])}::uuid, {esc(r['product_id'])}::uuid, {esc(r['buyer_id'])}::uuid, {esc(r['id'])}::uuid, {rating}, {esc(text) if text else 'null'}, false);""")
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


def cycle_tick(speed):
    for fn in (attend_orders, attend_appointments, attend_service_cycle):
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
    ap.add_argument('--once', choices=['order', 'appointment', 'chat', 'tick'])
    a = ap.parse_args()
    load()
    if a.once:
        return safe({'order': make_order, 'appointment': make_appointment, 'chat': customer_asks, 'tick': lambda: cycle_tick(a.speed)}[a.once])
    log(f"{STORE['name']}: {len(GOODS)} produtos, {len(SERVICES)} serviços, {len(CUSTOMERS)} clientes. " + ('Os pedidos chegam como PENDENTES — quem atende é você.' if a.manual else 'A loja atende sozinha: aceita, prepara, entrega, responde e o cliente avalia.'))
    for _ in range(a.burst):
        safe(make_order)
        time.sleep(0.4)
    for _ in range(3):
        safe(make_appointment)
    stop = threading.Event()
    loop(a.every, make_order, stop)
    loop(a.appts_every, make_appointment, stop)
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
