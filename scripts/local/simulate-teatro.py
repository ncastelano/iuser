#!/usr/bin/env python3
"""ALIMENTADOR do TEATRO DE 6 TELAS (página /tres-telas) — SÓ no Supabase LOCAL.

As telas só ATENDEM; quem faz o movimento chegar é este script (e o simulate-pizzaria.py --theater, para a pizzaria). Aqui:
  - HELENA (Clínica Mente Viva + o perfil dela): clientes de teste agendam serviços da loja (com a entrada Pix informada às vezes) e puxam conversa com a loja;
  - CORRIDAS (motorista de corridas = rede-eva-administradora): passageiros pedem motorista (pessoa, às vezes com oferta de valor, animal, objeto), e o passageiro ESCOLHE a
    motorista quando ela se candidata; depois da corrida o passageiro a avalia;
  - ENTREGAS de OUTRA LOJA (Farmácia Plantão 24h): pedidos com entrega chegam, o dono aceita e deixa pronto sozinho, para os entregadores independentes (Léo e Tito) terem entregas além
    das da pizzaria (a dona e o motorista fixo são da pizzaria).
Tudo age COMO as próprias pessoas (papel `authenticated` + JWT: RLS, gatilhos e RPCs valem).

  python3 -u scripts/local/simulate-teatro.py               # roda até Ctrl-C (normalmente sobe sozinho com o Teatro ligado: npm run sim → botão 🎬 da página /tres-telas)
  python3 scripts/local/simulate-teatro.py --once helena    # uma rodada só: helena | chat | ride | choose | doces | attend | rate
"""
import argparse, json, math, os, random, re, signal, sys, threading, time
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import psql, q_local  # noqa: E402

UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
R = random.Random()
LOCK = threading.Lock()
RESERVED = ('28e08603-96b0-49fc-867e-efc3d8e7d63b', 'e72ff0cd-7a15-4177-b615-a035d3ef569c')   # Ana Silva e Felipe Costa: da pessoa
CLINIC_SLUG, DOCES_SLUG, RIDE_DRIVER_SLUG = 'clinica-mente-viva', '24h-farmacia-plantao', 'rede-eva-administradora'


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


def safe(fn):
    try:
        fn()
    except Exception as e:  # noqa: BLE001
        log(f"  ✗ {fn.__name__}: {str(e).splitlines()[0][:140]}")


def loop(every, fn, stop):
    def run():
        stop.wait(R.uniform(1, 5))
        while not stop.is_set():
            safe(fn)
            stop.wait(every * R.uniform(0.9, 1.1))
    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t


CUSTOMERS, CLINIC, SVCS, DOCES, DOCES_GOODS, EVA = [], {}, [], {}, [], {}
POINTS = [('Shopping Porto Velho', -8.7555, -63.8929), ('Rodoviária', -8.7712, -63.8955), ('Aeroporto', -8.7093, -63.9023), ('Mercado Central', -8.7619, -63.9039),
          ('Av. Jorge Teixeira', -8.7541, -63.8932), ('Av. Calama', -8.7522, -63.9120), ('Rua Dom Pedro II', -8.7645, -63.9051), ('Porto Velho Shopping', -8.8052, -63.8689),
          ('Praça das Caixas d’Água', -8.7660, -63.9066), ('Av. Presidente Dutra', -8.7633, -63.9034), ('Hospital de Base', -8.7468, -63.8935), ('UNIR', -8.8004, -63.9348)]
STREETS = [('Rua das Palmeiras', -8.7612, -63.9008), ('Av. Campos Sales', -8.7604, -63.9077), ('Rua Almirante Barroso', -8.7619, -63.9002), ('Rua Rafael Vaz e Silva', -8.7660, -63.9066)]


def load():
    global CUSTOMERS, CLINIC, SVCS, DOCES, DOCES_GOODS, EVA
    CUSTOMERS = q_local("select p.id, p.\"profileSlug\" as slug, p.name from profiles p join auth.users u on u.id = p.id where u.email like 'cliente-%@staging.iuser.test' and p.id not in ("
                        + ','.join(f"'{x}'" for x in RESERVED) + ")")
    c = q_local(f"select id, name, \"storeSlug\" as slug, owner_id, logo_url from stores where \"storeSlug\" = {esc(CLINIC_SLUG)}")
    CLINIC = c[0] if c else {}
    SVCS = q_local(f"select id, name, price, coalesce(duration_minutes, 50) as dur from products where store_id = {esc(CLINIC['id'])}::uuid and is_active and type = 'service' and listing_type = 'sale'") if CLINIC else []
    d = q_local(f"select id, name, \"storeSlug\" as slug, owner_id, iuser_delivery_enabled as iu from stores where \"storeSlug\" = {esc(DOCES_SLUG)}")
    DOCES = d[0] if d else {}
    if DOCES and not DOCES['iu']:   # a outra loja precisa do "Entregador do iUser" ligado para os entregadores independentes receberem as entregas dela
        q_local(f"update stores set accepts_delivery = true, iuser_delivery_enabled = true where id = {esc(DOCES['id'])}::uuid")
        log(f"  ({DOCES['name']}: Entregador do iUser ligado para o Teatro)")
    DOCES_GOODS = q_local(f"select id, name, price from products where store_id = {esc(DOCES['id'])}::uuid and is_active and type = 'physical' and listing_type = 'sale'") if DOCES else []
    e = q_local(f"select id, name from profiles where \"profileSlug\" = {esc(RIDE_DRIVER_SLUG)}")
    EVA = e[0] if e else {}


RESTORE_FILE = os.path.expanduser('~/.iuser-sim/teatro-restore.json')
OWNER_SLUG = 'admin-teste'


def owner_driver_mode(on):
    """A dona da pizzaria (admin-teste) também é motorista: com o modo motorista ligado, os alertas de corrida cobrem a tela dela. Desliga enquanto o Teatro roda e restaura ao sair."""
    if on:
        r = q_local(f"select dp.driver_id, dp.driver_mode_active as on_ from driver_pricing dp join profiles p on p.id = dp.driver_id where p.\"profileSlug\" = {esc(OWNER_SLUG)}")
        if r and r[0]['on_']:
            os.makedirs(os.path.dirname(RESTORE_FILE), exist_ok=True)
            open(RESTORE_FILE, 'w').write(json.dumps({'driver_id': r[0]['driver_id']}))
            q_local(f"update driver_pricing set driver_mode_active = false where driver_id = {esc(r[0]['driver_id'])}::uuid")
            log(f"  ({OWNER_SLUG}: modo motorista desligado enquanto o Teatro roda)")
    elif os.path.exists(RESTORE_FILE):
        try:
            d = json.loads(open(RESTORE_FILE).read())
            q_local(f"update driver_pricing set driver_mode_active = true where driver_id = {esc(d['driver_id'])}::uuid")
            os.remove(RESTORE_FILE)
            log(f"  ({OWNER_SLUG}: modo motorista religado)")
        except Exception as e:  # noqa: BLE001
            log(f"  ✗ não consegui religar o modo motorista: {e}")


def point_address(p):
    return f"{p[0]}, Porto Velho - RO"


def hav(a, b, c, d):
    r = 6371
    p1, p2 = math.radians(a), math.radians(c)
    x = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(d - b) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(x))


# ---------------------------------------------------------------- HELENA
HELENA_ASKS = ['Oi! Vocês atendem online?', 'Qual o valor da primeira consulta?', 'Tem horário para esta semana?', 'A terapia de casal precisa de os dois estarem presentes?',
               'Vocês aceitam plano de saúde?', 'Quanto tempo dura uma sessão?', 'Dá para remarcar se eu não puder ir?', 'Gostaria de saber mais sobre a avaliação psicológica.',
               'A orientação vocacional é indicada para quem está no ensino médio?', 'Fico ansioso e queria conversar com alguém, por onde começo?']


def helena_free_slot(dur):
    busy = {}
    for r in q_local(f"select date::text as dia, time::text as hora, coalesce(duration_minutes, 60) as dur from appointments where provider_profile_id = {esc(CLINIC['owner_id'])}::uuid "
                     f"and status in ('pending','confirmed','completed') and date >= current_date"):
        h, m = int(r['hora'][:2]), int(r['hora'][3:5])
        busy.setdefault(r['dia'], []).append((h * 60 + m, h * 60 + m + int(r['dur'])))
    for _ in range(80):
        day = (datetime.now() + timedelta(days=R.randint(1, 21))).date()
        if day.weekday() >= 5:
            continue
        start = R.choice(range(8 * 60, 18 * 60 + 1, 30))
        if any(start < e and b < start + dur for b, e in busy.get(str(day), [])):
            continue
        return day, start // 60, start % 60
    return None


def helena_booking():
    if not CLINIC or not SVCS:
        return log('  (Clínica Mente Viva sem serviços: nada a agendar)')
    c = R.choice(CUSTOMERS)
    svc = R.choice(SVCS)
    slot = helena_free_slot(int(svc['dur']))
    if not slot:
        return log('  (agenda da Helena cheia nas próximas semanas)')
    day, hour, minute = slot
    items = json.dumps([{'product_id': svc['id'], 'quantity': 1}])
    sql = f"""insert into appointments (store_id, store_slug, store_name, store_logo_url, customer_id, customer_slug, owner_id, owner_slug, provider_profile_id, date, time, duration_minutes,
        service_name, service_type, people_count, status, direction, is_public, service_items)
        select {esc(CLINIC['id'])}::uuid, {esc(CLINIC['slug'])}, {esc(CLINIC['name'])}, {esc(CLINIC['logo_url'] or '')}, {esc(c['id'])}::uuid, {esc(c['slug'])}, {esc(CLINIC['owner_id'])}::uuid,
               {esc(CLINIC['slug'])}, {esc(CLINIC['owner_id'])}::uuid, {esc(str(day))}::date, {esc('%02d:%02d:00' % (hour, minute))}::time, {int(svc['dur'])},
               {esc(svc['name'])}, 'service', {2 if 'Casal' in svc['name'] else 1}, 'pending', 'outgoing', false, {esc(items)}::jsonb returning id;"""
    out = as_user(c['id'], sql)
    ids = re.findall(UUID, out)
    paid = ''
    if ids and R.random() < 0.6:
        try:
            as_user(c['id'], f"select report_appointment_deposit({esc(ids[-1])}::uuid);")
            paid = ' — entrada informada por Pix'
        except Exception:  # noqa: BLE001
            pass   # a clínica pode não pedir entrada
    log(f"🩺 {c['name']} pediu “{svc['name']}” na Clínica Mente Viva para {day.strftime('%d/%m')} {hour:02d}:{minute:02d}{paid}")


_conv = {}


def helena_chat():
    if not CLINIC:
        return
    c = R.choice(CUSTOMERS)
    if c['id'] not in _conv:
        out = as_user(c['id'], f"select start_conversation(null, {esc(CLINIC['id'])}::uuid);")
        _conv[c['id']] = re.findall(UUID, out)[-1]
    q = R.choice(HELENA_ASKS)
    as_user(c['id'], f"insert into direct_messages (conversation_id, sender_id, content) values ({esc(_conv[c['id']])}::uuid, {esc(c['id'])}::uuid, {esc(q)});")
    log(f"💬 {c['name']} escreve à Clínica Mente Viva: “{q}”")


# ---------------------------------------------------------------- CORRIDAS
def open_rides():
    return q_local("select id from ride_requests where status = 'pending' and order_id is null and created_at > now() - interval '25 minutes'")


def ride_feed():
    if not EVA:
        return log('  (motorista de corridas não encontrada)')
    if len(open_rides()) >= 3:
        return
    free = q_local("""select p.id, p.name from profiles p join auth.users u on u.id = p.id where u.email like 'cliente-%@staging.iuser.test' and p.id not in ("""
                   + ','.join(f"'{x}'" for x in RESERVED) + """) and not exists (select 1 from ride_requests r where r.requester_id = p.id and r.status in ('pending','accepted')) order by random() limit 1""")
    if not free:
        return
    p = free[0]
    a, b = R.sample(POINTS, 2)
    while hav(a[1], a[2], b[1], b[2]) < 1.2:
        a, b = R.sample(POINTS, 2)
    km = round(hav(a[1], a[2], b[1], b[2]) * 1.3, 1)
    kind = R.choices(['pessoa', 'objeto', 'animal'], [70, 15, 15])[0]
    extra_cols, extra_vals = '', ''
    if kind == 'objeto':
        extra_cols, extra_vals = ', object_description', f", {esc(R.choice(['Uma caixa de documentos', 'Um bolo de aniversário (frágil)', 'Duas sacolas de compras']))}"
    elif kind == 'animal':
        extra_cols, extra_vals = ', pet_description, has_pet, pet_has_carrier', f", {esc(R.choice(['Cachorro pequeno (Thor)', 'Gata Mimi']))}, true, true"
    pax = R.choice([1, 1, 2, 3]) if kind == 'pessoa' else 1
    sql = f"""insert into ride_requests (requester_id, ride_type, origin_address, destination_address, status, passenger_count, vehicle_type, origin_lat, origin_lng,
        destination_lat, destination_lng, distance_km, duration_min{extra_cols})
        values ({esc(p['id'])}::uuid, {esc(kind)}, {esc(point_address(a))}, {esc(point_address(b))}, 'pending', {pax}, 'carro', {a[1]}, {a[2]}, {b[1]}, {b[2]}, {km}, {max(4, round(km * 2.4))}{extra_vals}) returning id;"""
    rid = re.findall(UUID, as_user(p['id'], sql))[-1]
    offer = ''
    if kind == 'pessoa' and R.random() < 0.55:   # parte dos passageiros oferece um valor (às vezes acima da Tarifa iUser: corrida valorizada)
        val = round((7 + km * 2.2) * R.choice([0.9, 1.0, 1.15, 1.3, 1.5]), 2)
        try:
            as_user(p['id'], f"select set_passenger_offer({esc(rid)}::uuid, {val});")
            offer = f" — oferece R$ {val}"
        except Exception:  # noqa: BLE001
            pass
    log(f"🚗 {p['name']} pediu {'um motorista' if kind == 'pessoa' else 'um motorista (' + kind + ')'}: {a[0]} → {b[0]} ({km} km){offer}")


def ride_choose():
    """O passageiro escolhe a motorista quando ela se candidata."""
    if not EVA:
        return
    for r in q_local(f"""select r.id, r.requester_id, a.id as app from ride_requests r join ride_applications a on a.ride_request_id = r.id
        where r.status = 'pending' and a.status = 'pending' and a.applicant_id = {esc(EVA['id'])}::uuid and r.order_id is null and a.created_at < now() - interval '7 seconds' limit 2"""):
        as_user(r['requester_id'], f"select select_ride_driver({esc(r['id'])}::uuid, {esc(r['app'])}::uuid);")
        log(f"  ✅ o passageiro escolheu {EVA['name'].split()[0]} (corrida {r['id'][:8]})")


def ride_rate():
    """Depois da corrida, o passageiro avalia a motorista."""
    if not EVA:
        return
    for r in q_local(f"""select r.id, r.requester_id from ride_requests r where r.driver_id = {esc(EVA['id'])}::uuid and r.status = 'completed' and r.order_id is null
        and r.updated_at > now() - interval '2 hours' and not exists (select 1 from ride_reviews v where v.ride_request_id = r.id and v.reviewer_id = r.requester_id) limit 2"""):
        rating = R.choices([5, 4, 3], [70, 22, 8])[0]
        txt = R.choice(['Motorista educada e pontual.', 'Direção tranquila, carro limpo.', 'Ótima corrida, recomendo!', None, None])
        try:
            as_user(r['requester_id'], f"insert into ride_reviews (ride_request_id, reviewer_id, reviewee_id, rating, comment) values ({esc(r['id'])}::uuid, {esc(r['requester_id'])}::uuid, {esc(EVA['id'])}::uuid, {rating}, {esc(txt) if txt else 'null'});")
            log(f"  ⭐ o passageiro avaliou {EVA['name'].split()[0]} com {rating}★")
        except Exception as e:  # noqa: BLE001
            log(f"  ✗ avaliação da corrida: {str(e).splitlines()[0][:100]}")


# ---------------------------------------------------------------- ENTREGAS DE OUTRA LOJA
def doces_order():
    if not DOCES or not DOCES_GOODS:
        return log('  (Farmácia Plantão 24h sem produtos)')
    open_n = q_local(f"select count(*) as n from orders where store_id = {esc(DOCES['id'])}::uuid and status in ('pending','preparing','ready') and delivery_option = 'entrega'")
    if int(open_n[0]['n']) >= 3:
        return
    c = R.choice(CUSTOMERS)
    picks = R.sample(DOCES_GOODS, min(len(DOCES_GOODS), R.choice([1, 2, 2, 3])))
    items = [{'product_id': g['id'], 'quantity': R.choice([1, 1, 2]), 'comment': None, 'addons': []} for g in picks]
    street, lat, lng = R.choice(STREETS)
    lat, lng = lat + R.uniform(-0.006, 0.006), lng + R.uniform(-0.006, 0.006)
    addr = f"{street}, {R.randint(100, 2200)}, Porto Velho - RO"
    sql = (f"select create_store_order({esc(DOCES['id'])}::uuid, {esc(json.dumps(items))}::jsonb, 'entrega', 'pix', {esc(addr)}, {lat}, {lng}, null, null, null, gen_random_uuid());")
    d = json.loads(last_line(as_user(c['id'], sql)))
    log(f"💊 pedido de {c['name']} na Farmácia Plantão 24h: {len(items)} item(ns), entrega — R$ {float(d['total_amount']):.2f}".replace('.', ',', 1))


def doces_attend():
    """O dono da Farmácia Plantão 24h (sem tela) aceita e deixa pronto, para a entrega aparecer aos entregadores."""
    if not DOCES:
        return
    for o in q_local(f"select id, status, extract(epoch from now() - updated_at) as age from orders where store_id = {esc(DOCES['id'])}::uuid and status in ('pending','preparing') order by updated_at limit 6"):
        age = float(o['age'])
        if o['status'] == 'pending' and age > 12:
            as_user(DOCES['owner_id'], f"update orders set status = 'preparing' where id = {esc(o['id'])}::uuid;")
            log(f"  💊 Farmácia Plantão 24h aceitou o pedido {o['id'][:8]}")
        elif o['status'] == 'preparing' and age > 40:
            as_user(DOCES['owner_id'], f"update orders set status = 'ready' where id = {esc(o['id'])}::uuid;")
            log(f"  💊 pedido {o['id'][:8]} pronto — esperando entregador")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--helena-every', type=float, default=55, help='segundos entre um agendamento e o próximo na clínica da Helena')
    ap.add_argument('--chat-every', type=float, default=40, help='segundos entre uma mensagem e a próxima para a clínica')
    ap.add_argument('--ride-every', type=float, default=45, help='segundos entre um pedido de corrida e o próximo')
    ap.add_argument('--doces-every', type=float, default=70, help='segundos entre um pedido com entrega e o próximo na Farmácia Plantão 24h')
    ap.add_argument('--once', choices=['helena', 'chat', 'ride', 'choose', 'doces', 'attend', 'rate'])
    a = ap.parse_args()
    load()
    if a.once:
        return safe({'helena': helena_booking, 'chat': helena_chat, 'ride': ride_feed, 'choose': ride_choose, 'doces': doces_order, 'attend': doces_attend, 'rate': ride_rate}[a.once])
    owner_driver_mode(True)
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))   # o comando único para este processo com SIGTERM: sai limpo e restaura
    log(f"TEATRO (alimentador): {len(CUSTOMERS)} clientes; Helena = {CLINIC.get('name', '—')} ({len(SVCS)} serviços); corridas p/ {EVA.get('name', '—')}; entregas de {DOCES.get('name', '—')}.")
    stop = threading.Event()
    for fn in (helena_booking, helena_booking, helena_chat, ride_feed, doces_order):   # um começo com movimento
        safe(fn)
        time.sleep(0.5)
    loop(a.helena_every, helena_booking, stop)
    loop(a.chat_every, helena_chat, stop)
    loop(a.ride_every, ride_feed, stop)
    loop(6, ride_choose, stop)
    loop(20, ride_rate, stop)
    loop(a.doces_every, doces_order, stop)
    loop(8, doces_attend, stop)
    try:
        while True:
            time.sleep(60)
            if R.random() < 0.2:
                load()
    except KeyboardInterrupt:
        stop.set()
        owner_driver_mode(False)
        log('parado.')


if __name__ == '__main__':
    main()
