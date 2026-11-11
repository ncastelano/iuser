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
# slug do perfil, tipo, deslocamento (graus) a partir do centro, modelo, cor, placa, O QUE O VEÍCULO TEM, lugares, cadeirinha, porta-malas (sacolas P/M/G, malas P/M/G)
# `services` = as comodidades (lib/driverServices.ts: ar_condicionado, wifi, carregador, som, pet_friendly). De propósito VARIADO: carro completo,
# carro só com ar, carro sem nada, van grande, carro que aceita pet... para o passageiro ver a diferença antes de aceitar.
AR, WIFI, CARREG, SOM, PET = 'ar_condicionado', 'wifi', 'carregador', 'som', 'pet_friendly'
DRIVERS = [
    ('rede-ana-usuaria',        'carro',     ( 0.012, -0.010), 'Onix',        'Prata',   'NDA-1A23', [AR, CARREG],                 4, False, (2, 2, 1, 1, 1, 0)),
    ('rede-bruno-lider',        'carro',     (-0.018,  0.021), 'HB20',        'Branco',  'NEB-4C56', [AR, WIFI, CARREG, SOM],      4, True,  (3, 2, 1, 1, 1, 1)),
    ('rede-carla-supervisora',  'carro',     ( 0.030,  0.012), 'Corolla',     'Preto',   'NCC-7D89', [AR, WIFI, CARREG, SOM, PET], 4, True,  (3, 3, 2, 2, 1, 1)),
    ('rede-diego-gestor',       'carro',     (-0.031, -0.018), 'Argo',        'Vermelho','NDE-2F10', [],                           4, False, (2, 1, 0, 1, 0, 0)),
    ('rede-eva-administradora', 'carro',     ( 0.004,  0.033), 'Polo',        'Cinza',   'NFG-8H45', [AR, SOM],                    4, False, (2, 2, 1, 1, 1, 0)),
    ('rede-fabio-convidado',    'carro',     (-0.008, -0.034), 'Kwid',        'Azul',    'NHJ-3K67', [PET],                        4, False, (1, 1, 0, 1, 0, 0)),
    ('rede-gabi-convidada',     'moto',      (-0.006, -0.019), 'CG 160',      'Vermelha','NLM-5N12', [],                           1, False, (0, 0, 0, 0, 0, 0)),
    ('rede-hugo-convidado',     'moto',      ( 0.004,  0.006), 'Factor 150',  'Preta',   'NOP-6Q34', [CARREG],                     1, False, (0, 0, 0, 0, 0, 0)),
    ('rede-iara-convidada',     'moto',      (-0.025, -0.004), 'Biz 125',     'Branca',  'NRS-9T56', [],                           1, False, (0, 0, 0, 0, 0, 0)),
    ('rede-joao-neto',          'moto',      ( 0.021, -0.027), 'Fan 160',     'Azul',    'NUV-1W78', [CARREG],                     1, False, (0, 0, 0, 0, 0, 0)),
    ('rede-lia-neta',           'moto',      (-0.014,  0.009), 'Pop 110',     'Prata',   'NXY-2Z90', [],                           1, False, (0, 0, 0, 0, 0, 0)),
    ('cliente-teste',           'bicicleta', ( 0.009,  0.018), 'Caloi 10',    'Verde',   '',         [],                           1, False, (0, 0, 0, 0, 0, 0)),
    ('indicado-teste',          'bicicleta', (-0.012, -0.012), 'Houston',     'Preta',   '',         [],                           1, False, (0, 0, 0, 0, 0, 0)),
    ('prestador-teste',         'bicicleta', ( 0.017, -0.006), 'Sense',       'Laranja', '',         [],                           1, False, (0, 0, 0, 0, 0, 0)),
    # mais carros, cada um com um conjunto diferente
    ('eduarda-rocha-110',       'carro',     ( 0.006, -0.004), 'Gol',         'Branco',  'NAA-1B11', [],                           4, False, (1, 1, 0, 1, 0, 0)),
    ('fabio-barbosa-111',       'carro',     (-0.004,  0.007), 'Cronos',      'Prata',   'NAB-2C22', [AR],                         4, False, (2, 2, 1, 1, 1, 0)),
    ('giovana-cardoso-112',     'carro',     ( 0.009,  0.003), 'Tracker',     'Preto',   'NAC-3D33', [AR, WIFI, CARREG],           4, True,  (3, 2, 2, 2, 1, 1)),
    ('heitor-rodrigues-113',    'carro',     (-0.010, -0.006), 'Spin',        'Cinza',   'NAD-4E44', [AR, SOM, PET],               6, True,  (3, 3, 2, 2, 2, 1)),
    ('ingrid-gomes-114',        'carro',     ( 0.002,  0.012), 'Mobi',        'Vermelho','NAE-5F55', [CARREG],                     4, False, (1, 1, 0, 0, 1, 0)),
    ('jorge-barros-115',        'carro',     (-0.013,  0.002), 'Compass',     'Branco',  'NAF-6G66', [AR, WIFI, CARREG, SOM],      4, True,  (3, 3, 2, 2, 2, 1)),
    ('larissa-castro-116',      'carro',     ( 0.015, -0.015), 'Virtus',      'Azul',    'NAG-7H77', [AR, WIFI],                   4, False, (2, 2, 1, 1, 1, 1)),
    ('mateus-pereira-117',      'carro',     (-0.002, -0.014), 'Sandero',     'Prata',   'NAH-8J88', [SOM, PET],                   4, False, (2, 1, 1, 1, 1, 0)),
    ('natalia-fernandes-118',   'carro',      ( 0.011,  0.009), 'Sprinter',    'Branca',  'NAI-9K99', [AR, WIFI, CARREG],           15, False, (4, 4, 4, 4, 4, 3)),
    ('otavio-monteiro-119',     'moto',      (-0.007,  0.004), 'XRE 300',     'Preta',   'NAJ-0L00', [CARREG],                     1, False, (0, 0, 0, 0, 0, 0)),
]


def lit(v):
    return 'null' if v is None else "'" + str(v).replace("'", "''") + "'"


def arr(xs):
    return "array[" + ",".join(lit(x) for x in xs) + "]::text[]" if xs else "'{}'::text[]"


def setup():
    for i, (slug, kind, _, model, color, plate, services, seats, baby, trunk) in enumerate(DRIVERS):
        pid = q_local(f'''select id from profiles where "profileSlug"={lit(slug)}''')
        if not pid:
            print('  (perfil não encontrado:', slug, ')'); continue
        pid = pid[0]['id']
        bp, bm, bg, sp, sm, sg = trunk
        q_local(f'''insert into driver_vehicles (driver_id, vehicle_kind, car_model, car_color, car_plate, services, passenger_capacity, has_baby_seat,
                        trunk_bags_pequena, trunk_bags_media, trunk_bags_grande, trunk_suitcases_pequena, trunk_suitcases_media, trunk_suitcases_grande)
                    values ('{pid}', '{kind}', {lit(model)}, {lit(color)}, {lit(plate)}, {arr(services)}, {seats}, {str(baby).lower()}, {bp}, {bm}, {bg}, {sp}, {sm}, {sg})
                    on conflict (driver_id, vehicle_kind) do update set car_model=excluded.car_model, car_color=excluded.car_color, car_plate=excluded.car_plate,
                        services=excluded.services, passenger_capacity=excluded.passenger_capacity, has_baby_seat=excluded.has_baby_seat,
                        trunk_bags_pequena=excluded.trunk_bags_pequena, trunk_bags_media=excluded.trunk_bags_media, trunk_bags_grande=excluded.trunk_bags_grande,
                        trunk_suitcases_pequena=excluded.trunk_suitcases_pequena, trunk_suitcases_media=excluded.trunk_suitcases_media, trunk_suitcases_grande=excluded.trunk_suitcases_grande''')
        # 2 de cada 3 têm a chave Pix cadastrada (o passageiro que paga por Pix vê "Recebe por Pix" ou "Ainda sem Pix" em cada candidato)
        if i % 3 != 2:
            q_local(f'''insert into driver_payout_keys (driver_id, pix_key_type, pix_key, consent_at, updated_at)
                        values ('{pid}', 'phone', '6999{i:07d}', now(), now()) on conflict (driver_id) do nothing''')
        else:
            q_local(f"delete from driver_payout_keys where driver_id = '{pid}'")


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
