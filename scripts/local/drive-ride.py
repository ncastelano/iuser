#!/usr/bin/env python3
"""Motorista de CORRIDA de passageiro (só LOCAL): quando o passageiro ESCOLHE um motorista, este script faz esse motorista
andar até a partida, iniciar a corrida e andar até o destino (≈40 km/h pela rota do Mapbox), como uma pessoa usando o app.

Como uma pessoa usando o app (papel `authenticated` + JWT do motorista, então RLS, gatilhos e RPCs valem):
  1. espera uma corrida do passageiro com motorista escolhido (status 'accepted', sem order_id);
  2. marca 'a caminho' (driver_en_route) e anda até a partida, atualizando a posição ao vivo a cada segundo;
  3. marca 'cheguei' (driver_arrived_at), espera um pouco e INICIA a corrida (ride_started_at);
  4. anda até o destino e conclui a corrida (complete_ride, que confere a distância do destino).

  python3 -u scripts/local/drive-ride.py                       # passageiro dog-passageiro, 40 km/h
  python3 -u scripts/local/drive-ride.py --passageiro dog-passageiro --kmh 40
"""
import argparse, importlib.util, json, math, os, sys, time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import psql, q_local  # noqa: E402

_spec = importlib.util.spec_from_file_location('drive_driver', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'drive-driver.py'))
dd = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(dd)  # reaproveita as rotas do Mapbox, o movimento e o JWT do motorista


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


class RideDriver:
    """Um motorista qualquer (o escolhido pelo passageiro), pelo id dele."""
    def __init__(self, uid, name, kmh):
        self.id, self.name, self.kmh = uid, name, kmh
        r = q_local(f"select live_lat, live_lng from driver_pricing where driver_id = {esc(uid)}::uuid")
        self.pos = (float(r[0]['live_lat']), float(r[0]['live_lng'])) if r and r[0]['live_lat'] is not None else None

    def put_pos(self, p):
        self.pos = p
        psql(['-c', f"update driver_pricing set live_lat = {p[0]}, live_lng = {p[1]}, live_updated_at = now() where driver_id = {esc(self.id)}::uuid"])

    def go(self, dest, label):
        if self.pos is None:
            self.pos = dest
        route = dd.road_route(self.pos, dest)
        km = sum(dd.hav_km(route[i], route[i + 1]) for i in range(len(route) - 1))
        log(f"  🚗 {self.name}: {label} ({km:.1f} km, ~{max(1, round(km / self.kmh * 60))} min)")
        step = self.kmh / 3600.0
        cum = [0.0]
        for i in range(len(route) - 1):
            cum.append(cum[-1] + dd.hav_km(route[i], route[i + 1]))
        d, i = step, 0
        while d < cum[-1]:
            while cum[i + 1] < d:
                i += 1
            seg = cum[i + 1] - cum[i]
            f = (d - cum[i]) / seg if seg else 1
            a, b = route[i], route[i + 1]
            self.put_pos((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
            time.sleep(1.0)
            d += step
        self.put_pos(dest)


def ride_of(passageiro):
    r = q_local(f"""select r.id, r.status, r.driver_id, p.name as driver_name, r.origin_lat, r.origin_lng, r.destination_lat, r.destination_lng,
                 r.driver_en_route, r.driver_arrived_at is not null as arrived, r.ride_started_at is not null as started
          from ride_requests r join profiles req on req.id = r.requester_id left join profiles p on p.id = r.driver_id
          where req."profileSlug" = {esc(passageiro)} and r.order_id is null and r.status in ('pending','accepted')
          order by r.created_at desc limit 1""")
    return r[0] if r else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--passageiro', default='dog-passageiro')
    ap.add_argument('--kmh', type=float, default=40.0)
    a = ap.parse_args()
    log(f"Esperando o passageiro @{a.passageiro} escolher um motorista…")
    while True:
        ride = ride_of(a.passageiro)
        if ride and ride['status'] == 'accepted' and ride['driver_id']:
            break
        time.sleep(3)
    rid, uid = ride['id'], ride['driver_id']
    m = RideDriver(uid, ride['driver_name'] or 'Motorista', a.kmh)
    origin = (float(ride['origin_lat']), float(ride['origin_lng']))
    dest = (float(ride['destination_lat']), float(ride['destination_lng']))
    log(f"Corrida {rid[:8]} aceita por {m.name}. Vou andar até a partida.")

    dd.as_user(uid, f"update ride_requests set driver_en_route = true, driver_departed_at = now() where id = {esc(rid)}::uuid;")
    m.go(origin, 'partida')
    dd.as_user(uid, f"update ride_requests set driver_arrived_at = now() where id = {esc(rid)}::uuid;")
    log('  cheguei na partida; esperando um pouco antes de iniciar')
    time.sleep(6)
    dd.as_user(uid, f"update ride_requests set ride_started_at = now() where id = {esc(rid)}::uuid;")
    log('  corrida iniciada')
    m.go(dest, 'destino')
    out = dd.as_user(uid, f"select public.complete_ride({esc(rid)}::uuid, {dest[0]}, {dest[1]});")
    log(f"  corrida concluída: {out or 'ok'}")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        log('parado')
