# Imóveis de teste para o aluguel (banco LOCAL): anúncios de vários tipos (mensal e temporada), uma imobiliária (loja) e endereços privados.
# Rodar: python3 scripts/local/seed-rentals.py   (idempotente: refaz os anúncios de teste, slugs "demo-*")
import sys, os, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import q_local, psql

R = random.Random(7)
hosts = q_local("""select s.user_id id, p."profileSlug" slug from subscriptions s join plans pl on pl.id = s.plan_id join profiles p on p.id = s.user_id
    where pl.code in ('pos_pago','pre_pago','beta') and s.status = 'active' and s.current_period_end > now() group by 1,2 limit 6""")
if len(hosts) < 3:
    sys.exit('poucos donos com plano ativo no banco local')
stores = q_local("select id, owner_id from stores where is_active order by created_at limit 8")
imgs = [r['image_url'] for r in q_local("select distinct image_url from products where image_url is not null and image_url not like 'http%' limit 40")]

BAIRROS = [('Centro', -8.762, -63.903), ('Olaria', -8.7635, -63.9035), ('São Cristóvão', -8.763, -63.906), ('Embratel', -8.755, -63.93), ('Pedrinhas', -8.76, -63.9), ('Industrial', -8.748, -63.89), ('Liberdade', -8.761, -63.908), ('Caiari', -8.7655, -63.9045)]
RUAS = ['Rua Dom Pedro II', 'Av. Sete de Setembro', 'Rua Campos Sales', 'Av. Calama', 'Rua José Bonifácio', 'Av. Jorge Teixeira', 'Rua Almirante Barroso']
AM = ['Wi-Fi', 'Ar-condicionado', 'Piscina', 'Churrasqueira', 'Portaria 24h', 'Elevador', 'Varanda', 'Garagem coberta', 'Cozinha equipada', 'Câmeras de segurança']
SPECS = [
    ('apartamento', 'mensal', 'Apartamento 2 quartos', 1700, 2, 1, 1, 62), ('apartamento', 'mensal', 'Apartamento 3 quartos com varanda', 2600, 3, 2, 2, 98),
    ('casa', 'mensal', 'Casa 3 quartos com quintal', 2400, 3, 2, 2, 140), ('kitnet', 'mensal', 'Kitnet mobiliada perto do centro', 900, 1, 1, 0, 26),
    ('quarto', 'mensal', 'Quarto individual com banheiro', 650, 1, 1, 0, 14), ('sala_comercial', 'mensal', 'Sala comercial no centro', 1500, None, 1, 1, 38),
    ('loja', 'mensal', 'Ponto comercial na avenida', 4200, None, 1, 0, 90), ('casa', 'temporada', 'Casa de temporada com piscina', 380, 3, 2, 2, 150),
    ('apartamento', 'temporada', 'Studio para temporada no centro', 160, 1, 1, 1, 30), ('chacara', 'temporada', 'Chácara para fim de semana', 520, 4, 2, 4, 2000),
    ('apartamento', 'mensal', 'Apartamento 1 quarto mobiliado', 1300, 1, 1, 1, 45), ('casa', 'mensal', 'Casa 2 quartos aceita pet', 1500, 2, 1, 1, 80),
]
psql(['-c', "delete from rental_listings where slug like 'demo-%'"])
n = 0
for i, (typ, kind, title, price, beds, baths, park, area) in enumerate(SPECS):
    h = hosts[i % len(hosts)]
    store = next((s for s in stores if s['owner_id'] == h['id']), None) if i % 3 == 0 else None
    b = BAIRROS[i % len(BAIRROS)]
    photos = [R.choice(imgs) for _ in range(R.randint(2, 5))] if imgs else []
    am = R.sample(AM, R.randint(3, 6))
    period = 'mes' if kind == 'mensal' else 'dia'
    pets = R.random() < 0.5
    furn = typ in ('kitnet', 'quarto') or R.random() < 0.4
    lat, lng = round(b[1], 2), round(b[2], 2)
    sql = f"""
    with ins as (
      insert into rental_listings (slug, owner_id, store_id, title, description, property_type, rental_kind, price_period, price, condo_fee, iptu_fee, deposit_amount,
         bedrooms, bathrooms, parking, area_m2, furnished, pets_allowed, amenities, rules, photos, neighborhood, city, state, approx_lat, approx_lng, min_stay_days, max_guests, created_at)
      values ('demo-{i}-{R.randint(1000,9999)}', '{h['id']}', {f"'{store['id']}'" if store else 'null'}, '{title}',
         'Imóvel bem cuidado, perto de comércio e transporte. Ótimo para quem quer praticidade. Visita com hora marcada pelo iUser.', '{typ}', '{kind}', '{period}', {price},
         {R.choice([0, 180, 250, 320]) if kind == 'mensal' and typ in ('apartamento','kitnet','sala_comercial') else 0}, {R.choice([0, 40, 65]) if kind == 'mensal' else 0}, {price * 2 if kind == 'mensal' and R.random() < 0.6 else 0},
         {beds if beds is not None else 'null'}, {baths}, {park}, {area}, {str(furn).lower()}, {str(pets).lower()}, array[{','.join("'" + a + "'" for a in am)}]::text[],
         'Silêncio após as 22h. Sem festas.', array[{','.join("'" + p + "'" for p in photos)}]::text[], '{b[0]}', 'Porto Velho', 'RO', {lat}, {lng},
         {3 if kind == 'temporada' else 'null'}, {6 if kind == 'temporada' else 'null'}, now() - interval '{i * 3} hours')
      returning id)
    insert into rental_listing_private (listing_id, address, number, complement, lat, lng)
    select id, '{R.choice(RUAS)}', '{R.randint(50, 990)}', 'Apto {R.randint(11, 84)}', {b[1]}, {b[2]} from ins;"""
    psql(['-c', sql]); n += 1
print(f'{n} imóveis de teste criados por {len(hosts)} anunciantes')
