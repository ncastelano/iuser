#!/usr/bin/env python3
"""CANDIDATOS PARA A SUA CORRIDA (só LOCAL).

Fica olhando as corridas PENDENTES de uma pessoa (padrão: admin-teste) feitas no /pedir-motorista e, para cada uma,
faz motoristas de teste DE VERDADE (como eles mesmos: authenticated + JWT, então RLS, gatilhos e mínimos valem)
se candidatarem, um de cada vez, com 1, 2 ou 3 valores — para ver o cartão dos candidatos (carro, nota, chega em,
valores) como o passageiro vê. NUNCA escolhe o motorista pela pessoa: quem escolhe é você, na tela.

Uso:
  python3 -u scripts/local/candidatos-corrida.py [--para admin-teste] [--max 5] [--gap 4 10]

Os motoristas precisam estar ativos com posição fresca: deixe `python3 scripts/local/seed-drivers.py --loop` rodando.
"""
import argparse, json, math, os, random, sys, time
from datetime import datetime

sys.path.insert(0, os.path.dirname(__file__))
from _common import psql, q_local  # noqa: E402

R = random.Random()
RESERVED = ('28e08603-96b0-49fc-867e-efc3d8e7d63b', 'e72ff0cd-7a15-4177-b615-a035d3ef569c')   # Ana Silva e Felipe Costa


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"


def as_user(uid, sql):
    claims = json.dumps({'sub': uid, 'role': 'authenticated'})
    script = f"begin;\nselect set_config('request.jwt.claim.sub', {esc(uid)}, true), set_config('request.jwt.claims', {esc(claims)}, true);\nset local role authenticated;\n{sql}\ncommit;\n"
    return psql(['-At'], stdin=script)


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def hav(a1, o1, a2, o2):
    r = math.pi / 180
    x = math.sin((a2 - a1) * r / 2) ** 2 + math.cos(a1 * r) * math.cos(a2 * r) * math.sin((o2 - o1) * r / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(x))


def half(v):
    return round(v * 2) / 2


def brl(v):
    return f"R$ {v:.2f}".replace('.', ',')


def values_for(ride, tariff, pickup_km, floor):
    """Como um motorista de verdade pensaria: Tarifa iUser (corrida + ir buscar), às vezes a oferta do passageiro, às vezes um valor a mais."""
    km = float(ride['distance_km'] or 3)
    iuser = float(tariff['base_fee']) + max(0.0, km - float(tariff['base_distance_km'])) * float(tariff['price_per_km']) + pickup_km * float(tariff['price_per_km'])
    main = max(floor, round(iuser, 2))
    offer = float(ride['passenger_offer']) if ride['passenger_offer'] else None
    style = R.choices(['um', 'dois', 'tres', 'oferta'], [30, 35, 25, 10 if offer else 0])[0]
    if style == 'oferta' and offer and offer >= floor:
        main = offer
        alts = [half(max(iuser, offer) * 1.15)] if R.random() < 0.5 else []
    elif style == 'um':
        alts = []
    elif style == 'dois':
        alts = [half(main * R.uniform(1.12, 1.3))]
    else:
        a = half(main * R.uniform(1.1, 1.25))
        alts = [a, half(a * R.uniform(1.12, 1.3))]
    alts = sorted({a for a in alts if main < a <= main * 3})[:2]
    return round(main, 2), alts


def candidates(ride, already, limit):
    kind = ride['vehicle_type'] or 'carro'
    kind_sql = '' if kind == 'qualquer' else f"and v.vehicle_kind = {esc(kind)}"
    rows = q_local(f"""select distinct on (dp.driver_id) dp.driver_id as id, p.name, v.car_model, v.vehicle_kind, dp.live_lat, dp.live_lng
        from driver_pricing dp join profiles p on p.id = dp.driver_id join driver_vehicles v on v.driver_id = dp.driver_id
        where dp.driver_mode_active and dp.live_location_sync and dp.live_updated_at > now() - interval '10 minutes'
          and dp.live_lat is not null and dp.driver_id <> {esc(ride['requester_id'])}::uuid
          and dp.driver_id not in ({','.join(esc(x) for x in RESERVED)})
          and dp.driver_id not in (select u.id from auth.users u where u.email like 'entregador-%@staging.iuser.test')
          and not exists (select 1 from ride_requests r where r.driver_id = dp.driver_id and r.status = 'accepted')
          {kind_sql}
        order by dp.driver_id, v.updated_at desc nulls last""")
    rows = [r for r in rows if r['id'] not in already]
    for r in rows:
        r['km'] = hav(float(r['live_lat']), float(r['live_lng']), float(ride['origin_lat']), float(ride['origin_lng']))
    rows.sort(key=lambda r: r['km'] + R.uniform(0, 1.5))   # os mais perto, com um pouco de acaso
    return rows[:limit]


def ensure_plans():
    psql(['-c', """insert into subscriptions (user_id, plan_id, status, source, starts_at, current_period_end, granted_reason)
        select dp.driver_id, (select id from plans where code = 'pre_pago'), 'active', 'free_trial', now(), now() + interval '90 days', 'simulador local'
        from driver_pricing dp where dp.driver_mode_active and not coalesce((select has_driver from get_active_plan_grants(dp.driver_id)), false)"""])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--para', default='admin-teste', help='profileSlug de quem pede a corrida')
    ap.add_argument('--max', type=int, default=5, help='candidatos por corrida (a corrida lota com 5)')
    ap.add_argument('--gap', type=float, nargs=2, default=[4, 10], help='segundos entre um candidato e o próximo')
    a = ap.parse_args()

    who = q_local(f"select id, name from profiles where \"profileSlug\" = {esc(a.para)}")
    if not who:
        sys.exit(f"perfil {a.para} não encontrado")
    uid = who[0]['id']
    tariffs = {t['vehicle_kind']: t for t in q_local("select vehicle_kind, base_fee, base_distance_km, price_per_km from platform_tariffs")}
    ensure_plans()
    log(f"👀 olhando as corridas de @{a.para}. Peça um motorista no /pedir-motorista. (Ctrl-C para parar)")
    plan = {}   # corrida -> próximo instante para um candidato
    failed = {}  # corrida -> motoristas que o banco recusou (não tenta de novo)
    while True:
        rides = q_local(f"""select id, requester_id, vehicle_type, distance_km, origin_lat, origin_lng, passenger_offer, public._ride_trip_floor(id) as floor,
              (select count(*) from ride_applications x where x.ride_request_id = r.id) as n
            from ride_requests r where requester_id = {esc(uid)}::uuid and status = 'pending' and order_id is null and origin_lat is not null""")
        now = time.time()
        for ride in rides:
            rid = ride['id']
            if rid not in plan:
                plan[rid] = now + R.uniform(2, 5)
                log(f"🚗 corrida nova {rid[:8]} ({ride['vehicle_type']}, {ride['distance_km']} km, mínimo {brl(float(ride['floor']))})")
            if int(ride['n']) >= a.max or now < plan[rid]:
                continue
            already = {x['applicant_id'] for x in q_local(f"select applicant_id from ride_applications where ride_request_id = {esc(rid)}::uuid")} | failed.setdefault(rid, set())
            pick = candidates(ride, already, 1)
            if not pick:
                plan[rid] = now + 8
                continue
            d = pick[0]
            tariff = tariffs.get(d['vehicle_kind']) or tariffs['carro']
            main_v, alts = values_for(ride, tariff, d['km'] * 1.3, float(ride['floor']))
            alts_sql = 'null' if not alts else "array[" + ','.join(str(x) for x in alts) + "]::numeric[]"
            try:
                as_user(d['id'], f"insert into ride_applications (ride_request_id, applicant_id, proposed_price, alt_prices) values ({esc(rid)}::uuid, {esc(d['id'])}::uuid, {main_v}, {alts_sql});")
                vals = ' · '.join(brl(v) for v in [main_v] + alts)
                log(f"  🙋 {d['name']} ({d['car_model'] or d['vehicle_kind']}, a {d['km']:.1f} km) se candidatou: {vals}")
            except Exception as e:  # noqa: BLE001
                failed[rid].add(d['id'])
                log(f"  ✗ {d['name']} não pôde se candidatar: {str(e).splitlines()[0][:140]}")
            plan[rid] = now + R.uniform(*a.gap)
        for rid in list(plan):
            if rid not in {r['id'] for r in rides}:
                plan.pop(rid)
                failed.pop(rid, None)
        time.sleep(1.5)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
