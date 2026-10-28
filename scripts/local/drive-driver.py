#!/usr/bin/env python3
"""Faz um motorista iUser (padrão: a Dani) FAZER entregas de verdade, passo a passo, para você assistir na aba dele (/entregas) — SÓ no Supabase LOCAL.

Como uma pessoa usando o app (papel `authenticated` + JWT do motorista, então RLS, gatilhos e RPCs valem):
  1. liga o Modo motorista e ACEITA entregas abertas da pizzaria (as mais perto umas das outras, até a mochila dele);
  2. sai para a loja e ANDA pelas ruas (a rota do Mapbox, posição ao vivo atualizada a cada segundo: o mapa da tela dele acompanha);
  3. chega, espera o pedido ficar pronto (se demorar, a loja marca pronto), PEGA os pedidos;
  4. segue a ordem otimizada (Mapbox Optimization) e ENTREGA um por um (complete_ride no destino);
  5. depois (com --loop) pega as próximas.

  python3 -u scripts/local/drive-driver.py                 # Dani: uma saída completa
  python3 -u scripts/local/drive-driver.py --loop          # fica entregando até você parar (Ctrl-C)
  python3 -u scripts/local/drive-driver.py --driver leo --kmh 60 --max 3

Deixe o Teatro do /tres-telas DESLIGADO (ele também conduz motoristas) e o simulador da pizzaria sem `--manual-drivers` para essa pessoa.
"""
import argparse, json, math, os, random, re, sys, time, urllib.request
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import psql, q_local, ROOT  # noqa: E402

SLUG = 'pizzaria-forno-de-ouro'


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def as_user(uid, sql):
    claims = json.dumps({'sub': uid, 'role': 'authenticated'})
    script = f"begin;\nselect set_config('request.jwt.claim.sub', {esc(uid)}, true), set_config('request.jwt.claims', {esc(claims)}, true);\nset local role authenticated;\n{sql}\ncommit;\n"
    return psql(['-At'], stdin=script)


def token():
    for f in ('.env.local', '.env.development.local'):
        p = os.path.join(ROOT, f)
        if os.path.exists(p):
            m = re.search(r'^NEXT_PUBLIC_MAPBOX_TOKEN=(\S+)', open(p).read(), re.M)
            if m:
                return m.group(1).strip('"\'')
    return os.environ.get('NEXT_PUBLIC_MAPBOX_TOKEN', '')


TOKEN = token()


def hav_km(a, b):
    r = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(min(1, math.sqrt(h)))


def api_json(url):
    with urllib.request.urlopen(url, timeout=12) as r:
        return json.loads(r.read())


def road_route(a, b):
    """Pontos (lat, lng) da rota por ruas de a até b (Mapbox Directions); sem resposta, linha reta."""
    try:
        d = api_json(f"https://api.mapbox.com/directions/v5/mapbox/driving/{a[1]},{a[0]};{b[1]},{b[0]}?geometries=geojson&overview=full&access_token={TOKEN}")
        pts = [(c[1], c[0]) for c in d['routes'][0]['geometry']['coordinates']]
        if len(pts) >= 2:
            return pts
    except Exception as e:  # noqa: BLE001
        log(f"  (Mapbox sem resposta: {str(e)[:60]} — indo em linha reta)")
    return [a, b]


def optimized_order(origin, stops):
    """Ordem de entrega pela Optimization API do Mapbox (ruas de verdade); falhou: vizinho mais próximo."""
    if len(stops) >= 2 and len(stops) <= 11:
        try:
            coords = ';'.join(f"{p[1]},{p[0]}" for p in [origin] + [(s['lat'], s['lng']) for s in stops])
            d = api_json(f"https://api.mapbox.com/optimized-trips/v1/mapbox/driving/{coords}?source=first&roundtrip=false&access_token={TOKEN}")
            if d.get('code') == 'Ok':
                seq = [(w['waypoint_index'], i) for i, w in enumerate(d['waypoints'][1:])]
                return [stops[i] for _, i in sorted(seq)]
        except Exception:  # noqa: BLE001
            pass
    left, here, out = list(stops), origin, []
    while left:
        nxt = min(left, key=lambda s: hav_km(here, (s['lat'], s['lng'])))
        out.append(nxt); left.remove(nxt); here = (nxt['lat'], nxt['lng'])
    return out


class Driver:
    def __init__(self, key, kmh):
        r = q_local(f"select u.id, p.name from auth.users u join profiles p on p.id = u.id where u.email = 'entregador-{key}@staging.iuser.test'")
        if not r:
            sys.exit(f"Motorista '{key}' não existe: rode  node scripts/local/seed-entregadores.mjs")
        self.id, self.name, self.kmh = r[0]['id'], r[0]['name'], kmh
        v = q_local(f"select coalesce(delivery_capacity, 1) as cap from driver_vehicles where driver_id = {esc(self.id)}::uuid limit 1")
        self.cap = int(v[0]['cap']) if v else 1
        s = q_local(f"select id, name, owner_id, store_lat, store_lng from stores where \"storeSlug\" = {esc(SLUG)}")[0]
        self.store = s
        self.store_pos = (float(s['store_lat'] or -8.7580), float(s['store_lng'] or -63.8995))
        self.pos = self.read_pos()

    def read_pos(self):
        r = q_local(f"select live_lat, live_lng from driver_pricing where driver_id = {esc(self.id)}::uuid")
        return (float(r[0]['live_lat']), float(r[0]['live_lng'])) if r and r[0]['live_lat'] is not None else self.store_pos

    def put_pos(self, p):
        self.pos = p
        psql(['-c', f"update driver_pricing set live_lat = {p[0]}, live_lng = {p[1]}, live_updated_at = now() where driver_id = {esc(self.id)}::uuid"])

    def go(self, dest, label):
        """Anda pela rota até `dest` (≈1 posição por segundo)."""
        route = road_route(self.pos, dest)
        km = sum(hav_km(route[i], route[i + 1]) for i in range(len(route) - 1))
        log(f"  🛵 {self.name} a caminho: {label} ({km:.1f} km, ~{max(1, round(km / self.kmh * 60))} min de verdade)")
        step_km = self.kmh / 3600.0   # distância por segundo
        cum = [0.0]
        for i in range(len(route) - 1):
            cum.append(cum[-1] + hav_km(route[i], route[i + 1]))
        d = step_km
        i = 0
        while d < cum[-1]:
            while cum[i + 1] < d:
                i += 1
            seg = cum[i + 1] - cum[i]
            f = (d - cum[i]) / seg if seg else 1
            a, b = route[i], route[i + 1]
            self.put_pos((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
            time.sleep(1.0)
            d += step_km
        self.put_pos(dest)

    # ---- passos do app
    def online(self):
        as_user(self.id, f"update driver_pricing set driver_mode_active = true, live_location_sync = true where driver_id = {esc(self.id)}::uuid;")

    def rides(self):
        return q_local(f"""select r.id, r.order_id, r.recipient_name, r.destination_lat as lat, r.destination_lng as lng, r.offered_price, r.driver_en_route, r.driver_arrived_at is not null as arrived,
            r.ride_started_at is not null as started, o.status as order_status, o.buyer_id from ride_requests r join orders o on o.id = r.order_id
            where r.driver_id = {esc(self.id)}::uuid and r.status = 'accepted' order by r.created_at""")

    def open_offers(self):
        return q_local(f"""select r.id, r.destination_lat as lat, r.destination_lng as lng, r.offered_price, r.recipient_name, o.status as order_status
            from ride_requests r join orders o on o.id = r.order_id where r.status = 'pending' and r.driver_id is null and o.store_id = {esc(self.store['id'])}::uuid
            and o.status in ('preparing','ready') and o.updated_at > now() - interval '10 minutes' order by r.created_at""")

    def accept_some(self, limit):
        offers = self.open_offers()
        if not offers:
            return 0
        first = offers[0]
        batch = [first] + [o for o in sorted(offers[1:], key=lambda o: hav_km((float(first['lat']), float(first['lng'])), (float(o['lat']), float(o['lng'])))) if hav_km((float(first['lat']), float(first['lng'])), (float(o['lat']), float(o['lng']))) <= 3.5]
        n = 0
        for o in batch[:limit]:
            try:
                as_user(self.id, f"insert into ride_applications (ride_request_id, applicant_id, proposed_price) values ({esc(o['id'])}::uuid, {esc(self.id)}::uuid, {o['offered_price']});")
                n += 1
                log(f"  ✅ {self.name} ACEITOU a entrega para {o['recipient_name'] or 'cliente'} (R$ {float(o['offered_price']):.2f}; mochila {n}/{self.cap})".replace('.', ','))
                time.sleep(random.uniform(1.5, 2.5))
            except Exception as e:  # noqa: BLE001
                log(f"  · não deu para aceitar: {str(e).splitlines()[0][:90]}")
        return n

    def run_batch(self):
        rides = self.rides()
        if not rides:
            n = self.accept_some(self.cap)
            if not n:
                return False
            time.sleep(2)
            rides = self.rides()
            if not rides:
                return False
        ids = ','.join(esc(r['id']) + '::uuid' for r in rides)
        started = [r for r in rides if r['started']]
        if not started:
            if not rides[0]['driver_en_route']:
                as_user(self.id, f"update ride_requests set driver_en_route = true, driver_departed_at = now() where id in ({ids});")
                log(f"  🛵 {self.name} saiu para a loja com {len(rides)} entrega(s)")
            if hav_km(self.pos, self.store_pos) > 0.03:
                self.go(self.store_pos, self.store['name'])
            if not rides[0]['arrived']:
                as_user(self.id, f"update ride_requests set driver_arrived_at = now() where id in ({ids});")
                log(f"  📍 {self.name} chegou na loja e espera os pedidos")
            t0 = time.time()
            while True:
                st = [r['order_status'] for r in self.rides()]
                if all(s == 'ready' for s in st):
                    break
                if time.time() - t0 > 75:   # a loja demorou: ela marca pronto (para a demonstração seguir)
                    psql(['-c', f"update orders set status = 'ready' where id in (select order_id from ride_requests where id in ({ids})) and status = 'preparing'"])
                    log("  🏪 a loja marcou os pedidos como prontos")
                time.sleep(3)
            time.sleep(2)
            code = q_local(f"select code from delivery_pickup_codes where store_id = {esc(self.store['id'])}::uuid and driver_id = {esc(self.id)}::uuid and used_at is null")
            log(f"  🔑 a loja conferiu os pedidos e informou o código de retirada ({code[0]['code'] if code else 'sem código'})")
            time.sleep(1.5)
            out = as_user(self.id, f"select confirm_pickup(array[{ids.replace('::uuid', '')}]::uuid[], {esc(code[0]['code'] if code else '')});")
            if '"ok": true' not in out:
                raise RuntimeError('retirada recusada: ' + out.strip().splitlines()[-2][:120])
            log(f"  📦 {self.name} PEGOU {len(rides)} pedido(s) e saiu para entregar")
            rides = self.rides()
        stops = [{'id': r['id'], 'lat': float(r['lat']), 'lng': float(r['lng']), 'name': r['recipient_name'] or 'cliente', 'price': float(r['offered_price'])} for r in rides if r['started']]
        order = optimized_order(self.pos, stops)
        if len(order) > 1:
            log("  ✨ rota otimizada: " + ' → '.join(s['name'].split()[0] for s in order))
        for s in order:
            self.go((s['lat'], s['lng']), f"entrega para {s['name']}")
            time.sleep(1.2)
            as_user(self.id, f"select complete_ride({esc(s['id'])}::uuid, {s['lat']}, {s['lng']});")
            log(f"  🎉 {self.name} ENTREGOU para {s['name']} (R$ {s['price']:.2f})".replace('.', ','))
            time.sleep(random.uniform(2, 3))
        return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--driver', default='dani', help='dani | leo | rafa | tito')
    ap.add_argument('--kmh', type=float, default=45.0, help='velocidade na rua (km/h); 45 = ~12 m/s')
    ap.add_argument('--max', type=int, default=0, help='no máximo quantas entregas aceitar (padrão: a mochila dele)')
    ap.add_argument('--loop', action='store_true', help='depois de entregar, pega as próximas até você parar')
    a = ap.parse_args()
    d = Driver(a.driver, a.kmh)
    if a.max:
        d.cap = min(d.cap, a.max)
    d.online()
    log(f"{d.name} online — mochila {d.cap}, {a.kmh:g} km/h. Abra /entregas na aba dele para acompanhar.")
    try:
        while True:
            try:
                ok = d.run_batch()
            except RuntimeError as e:   # alguém mexeu na corrida (cancelada, pedido encerrado...): recomeça do que existe
                log(f"  · a corrida mudou no meio do caminho ({str(e).splitlines()[0][:80]}) — recomeçando")
                time.sleep(3)
                continue
            if not ok:
                if not a.loop:
                    log('Sem entregas abertas agora.')
                    return
                time.sleep(4)
            elif not a.loop:
                log('Saída concluída.')
                return
    except KeyboardInterrupt:
        log('parado.')


if __name__ == '__main__':
    main()
