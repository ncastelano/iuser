#!/usr/bin/env python3
"""Movimento da Pizzaria Forno de Ouro (conta admin-teste) — SÓ no Supabase LOCAL.

Clientes de teste fazem PEDIDOS (pizzas com ingredientes extras, refrigerantes, combos, entrega ou retirada, Pix/cartão/dinheiro) e
AGENDAMENTOS (rodízios e Ambiente VIP, com a entrada de 30% já informada por Pix) na loja da pessoa dona (admin-teste). Cada cliente age COMO ELE
MESMO (papel `authenticated` + JWT), então RLS, gatilhos e RPCs valem de verdade. Quem ATENDE é você, pelo app: aceitar/recusar o pedido,
"saiu para entrega", concluir, confirmar a entrada do agendamento, marcar "serviço feito". O simulador do ecossistema (simulate-ecosystem.py)
NÃO mexe nos pedidos nem nos agendamentos dessa loja.

  node scripts/local/seed-pizzaria.mjs                     # (uma vez) cria a loja, o cardápio e os serviços
  python3 -u scripts/local/simulate-pizzaria.py            # 6 pedidos de uma vez e depois um a cada ~25 s (Ctrl-C para parar)
  python3 -u scripts/local/simulate-pizzaria.py --burst 10 --every 15 --appts-every 60
  python3 scripts/local/simulate-pizzaria.py --once order  # só um pedido (ou: --once appointment)
"""
import argparse, json, os, random, re, sys, threading, time
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import psql, q_local  # noqa: E402

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
        day = (datetime.now() + timedelta(days=R.randint(1, 10))).date()
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
    ap.add_argument('--every', type=float, default=25, help='segundos entre um pedido e o próximo')
    ap.add_argument('--appts-every', type=float, default=90, help='segundos entre um agendamento e o próximo')
    ap.add_argument('--once', choices=['order', 'appointment'])
    a = ap.parse_args()
    load()
    if a.once:
        return safe(make_order if a.once == 'order' else make_appointment)
    log(f"{STORE['name']}: {len(GOODS)} produtos, {len(SERVICES)} serviços, {len(CUSTOMERS)} clientes. Os pedidos chegam como PENDENTES — quem atende é você.")
    for _ in range(a.burst):
        safe(make_order)
        time.sleep(0.4)
    for _ in range(3):
        safe(make_appointment)
    stop = threading.Event()
    loop(a.every, make_order, stop)
    loop(a.appts_every, make_appointment, stop)
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
