# Motoristas ATIVOS de teste no banco LOCAL, usando perfis que já existem (a rede do admin e alguns clientes): carros, motos e bicicletas
# espalhados por Porto Velho, com modo motorista ligado e localização ao vivo — para ver o mapa do /pedir-motorista (e o Radar).
# A posição "ao vivo" vale 10 min (regra da RPC get_active_drivers_map): use --loop para renovar a cada 4 min (e andar um pouquinho).
#   python3 scripts/local/seed-drivers.py          (cria/atualiza e termina)
#   python3 scripts/local/seed-drivers.py --loop   (renova a cada 4 min; Ctrl+C para parar)
# Só escreve no banco local.
import math, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import q_local, status_env

if 'supabase.co' in status_env()['API_URL']:
    sys.exit('RECUSADO: isto só roda no banco LOCAL.')

C = (-8.7612, -63.9039)   # centro de Porto Velho (onde o admin de teste mora)
# slug do perfil, tipo, deslocamento (graus) a partir do centro, modelo, cor, placa
DRIVERS = [
    ('rede-ana-usuaria',        'carro',     ( 0.012, -0.010), 'Onix',        'Prata',   'NDA-1A23'),
    ('rede-bruno-lider',        'carro',     (-0.018,  0.021), 'HB20',        'Branco',  'NEB-4C56'),
    ('rede-carla-supervisora',  'carro',     ( 0.030,  0.012), 'Corolla',     'Preto',   'NCC-7D89'),
    ('rede-diego-gestor',       'carro',     (-0.031, -0.018), 'Argo',        'Vermelho','NDE-2F10'),
    ('rede-eva-administradora', 'carro',     ( 0.004,  0.033), 'Polo',        'Cinza',   'NFG-8H45'),
    ('rede-fabio-convidado',    'carro',     (-0.008, -0.034), 'Kwid',        'Azul',    'NHJ-3K67'),
    ('rede-gabi-convidada',     'moto',      (-0.006, -0.019), 'CG 160',      'Vermelha','NLM-5N12'),
    ('rede-hugo-convidado',     'moto',      ( 0.004,  0.006), 'Factor 150',  'Preta',   'NOP-6Q34'),
    ('rede-iara-convidada',     'moto',      (-0.025, -0.004), 'Biz 125',     'Branca',  'NRS-9T56'),
    ('rede-joao-neto',          'moto',      ( 0.021, -0.027), 'Fan 160',     'Azul',    'NUV-1W78'),
    ('rede-lia-neta',           'moto',      (-0.014,  0.009), 'Pop 110',     'Prata',   'NXY-2Z90'),
    ('cliente-teste',           'bicicleta', ( 0.009,  0.018), 'Caloi 10',    'Verde',   ''),
    ('indicado-teste',          'bicicleta', (-0.012, -0.012), 'Houston',     'Preta',   ''),
    ('prestador-teste',         'bicicleta', ( 0.017, -0.006), 'Sense',       'Laranja', ''),
]


def lit(v):
    return 'null' if v is None else "'" + str(v).replace("'", "''") + "'"


def setup():
    for slug, kind, _, model, color, plate in DRIVERS:
        pid = q_local(f'''select id from profiles where "profileSlug"={lit(slug)}''')
        if not pid:
            print('  (perfil não encontrado:', slug, ')'); continue
        pid = pid[0]['id']
        q_local(f'''insert into driver_vehicles (driver_id, vehicle_kind, car_model, car_color, car_plate, services, passenger_capacity)
                    values ('{pid}', '{kind}', {lit(model)}, {lit(color)}, {lit(plate)}, array['pessoa','objeto'], {4 if kind == 'carro' else 1})
                    on conflict (driver_id, vehicle_kind) do update set car_model=excluded.car_model, car_color=excluded.car_color, car_plate=excluded.car_plate''')


tick = 0


def refresh():
    global tick
    tick += 1
    n = 0
    for i, (slug, kind, (dlat, dlng), *_rest) in enumerate(DRIVERS):
        lat = C[0] + dlat + math.sin(tick + i) * 0.002          # anda um pouquinho a cada renovação
        lng = C[1] + dlng + math.sin(tick + i + 3) * 0.002
        r = q_local(f'''select id from profiles where "profileSlug"={lit(slug)}''')
        if not r:
            continue
        pid = r[0]['id']
        q_local(f'''insert into driver_pricing (driver_id, pricing_mode, driver_mode_active, live_location_sync, live_lat, live_lng, live_updated_at)
                    values ('{pid}', 'platform', true, true, {lat}, {lng}, now())
                    on conflict (driver_id) do update set pricing_mode='platform', driver_mode_active=true, live_location_sync=true,
                        live_lat=excluded.live_lat, live_lng=excluded.live_lng, live_updated_at=now()''')
        n += 1
    print(f'[{time.strftime("%H:%M:%S")}] {n} motoristas ativos (posição ao vivo renovada; vale 10 min)', flush=True)


setup()
refresh()
if '--loop' in sys.argv:
    try:
        while True:
            time.sleep(4 * 60)
            refresh()
    except KeyboardInterrupt:
        pass
