# Etapa 2.5: aceite concorrente REAL numa entrega V2 (3 motoristas ao mesmo tempo → 1 vencedor; frozen = valor aceito) e a corrida
# "aceite × aumento do motor". NÃO liga nenhuma chave V2: cria direto (como serviço, fora do app) um pedido de teste marcado V2 com a
# estimativa e a entrega, roda conexões paralelas e APAGA tudo. Os avisos (pg_net) ficam desligados (app.skip_delivery_ping).
# Rodar: python3 supabase/tests/concurrent_accept_v2.py
import subprocess, json, re, os, threading
env = dict(os.environ); env.pop('SUPABASE_ACCESS_TOKEN', None)
cwd = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
S = os.environ.get('TMPDIR', '/tmp').rstrip('/') + '/'

def run(sql, name):
    path = S + name + '.sql'; open(path, 'w').write(sql)
    r = subprocess.run(['npx', 'supabase', 'db', 'query', '--linked', '-f', path], capture_output=True, text=True, env=env, cwd=cwd)
    out = r.stdout + r.stderr
    m = re.search(r'^\{.*?^\}', out, re.S | re.M)
    if m and '"rows"' in m.group(0): return ('ok', json.loads(m.group(0))['rows'])
    mm = re.search(r'message":"(.*?)"\}', out)
    return ('err', (mm.group(1) if mm else out[:300]).replace('\\n', ' '))

def q(sql, name='q'):
    s, v = run(sql, name)
    if s != 'ok': raise SystemExit('ERR ' + str(v))
    return v

ST = '93e432b4-0472-4ae4-abb1-45b516e2f7bd'

def setup(tag):
    sql = f"""
begin;
select set_config('app.skip_delivery_ping', '1', true);
alter table public.orders disable trigger order_push_notificatio;
create temp table _o as
with cust as (select id from profiles where "profileSlug" = 'lucy'),
est as (insert into delivery_estimates(customer_id, store_id, destination_lat, destination_lng, destination_address, estimated_freight, distance_km, calculation_version, snapshot, expires_at)
        select cust.id, '{ST}', -8.763734, -63.909044, 'rua dom pedro ii, 800, porto velho', 12, 5, 'est-v1', '{{"destination_check":"verified"}}', now() + interval '30 minutes' from cust returning id, customer_id),
ord as (insert into orders(store_id, buyer_id, buyer_name, buyer_profile_slug, total_amount, delivery_fee, delivery_option, payment_method, delivery_address, delivery_lat, delivery_lng, status, checkout_id, delivery_flow_version)
        select '{ST}', est.customer_id, 'Teste {tag}', 'lucy', 12, 12, 'entrega', 'combinar', 'Rua Dom Pedro II, 800, Porto Velho', -8.763734, -63.909044, 'preparing', gen_random_uuid(), 2 from est returning id)
select ord.id as order_id, est.id as est_id from ord, est;
alter table public.orders enable trigger order_push_notificatio;
update delivery_estimates set order_id = (select order_id from _o) where id = (select est_id from _o);
select _start_order_delivery_dispatch((select order_id from _o));
commit;
select o.id as "order", d.id as dispatch, d.ride_request_id as ride, s.owner_id as owner from orders o join order_delivery_dispatches d on d.order_id = o.id join stores s on s.id = o.store_id
 where o.store_id = '{ST}' and o.delivery_flow_version = 2 and o.buyer_name = 'Teste {tag}';
"""
    return q(sql, 'v2_setup')[0]

def cleanup(o, d, ride):
    q(f"""delete from order_delivery_dispatches where id = '{d}';
delete from driver_postpaid_charges where order_id = '{o}' or ride_request_id = '{ride}';
delete from ride_applications where ride_request_id = '{ride}';
delete from ride_requests where id = '{ride}';
delete from delivery_estimates where order_id = '{o}';
delete from orders where id = '{o}';
select (select count(*) from orders where id = '{o}') o, (select count(*) from ride_requests where id = '{ride}') r, (select count(*) from order_delivery_dispatches where id = '{d}') d""", 'v2_clean')

drivers = [r['id'] for r in q("""select driver_id as id from driver_pricing where driver_id <> (select owner_id from stores where id = '%s') and driver_id <> (select id from profiles where "profileSlug" = 'lucy') order by driver_id limit 3""" % ST, 'v2_drv')]
assert len(drivers) == 3, 'precisa de 3 motoristas de teste'

def state(o, d, ride):
    return q(f"""select (select count(*) from ride_applications where ride_request_id = '{ride}' and status = 'accepted') aceitas,
 (select count(*) from ride_applications where ride_request_id = '{ride}' and status = 'rejected') rejeitadas,
 (select count(*) from ride_applications where ride_request_id = '{ride}' and status = 'pending') pendentes,
 (select status || ' / ' || phase || ' / frozen=' || coalesce(frozen_freight::text, 'NULL') || ' / oferta=' || final_freight from order_delivery_dispatches where id = '{d}') entrega,
 (select count(*) from ride_requests where order_id = '{o}' and status = 'accepted' and driver_id is not null) corridas_ativas,
 (select string_agg(proposed_price::text, ',') from ride_applications where ride_request_id = '{ride}' and status = 'accepted') preco_do_aceite""", 'v2_state')[0]

# --- A: 3 motoristas ao mesmo tempo, no valor vigente
x = setup('conc-A'); o, d, ride = x['order'], x['dispatch'], x['ride']
res = {}
def apply(drv, i): res[i] = run(f"begin; select set_config('app.skip_delivery_ping','1',true); insert into ride_applications(ride_request_id, applicant_id, status, proposed_price) values ('{ride}','{drv}','pending',12); select pg_sleep(2); commit; select 1 as ok;", f'v2_ap{i}')
ts = [threading.Thread(target=apply, args=(dr, i)) for i, dr in enumerate(drivers)]; [t.start() for t in ts]; [t.join() for t in ts]
print('A candidaturas simultâneas:', [v[0] if v[0] == 'ok' else v[1][:70] for v in res.values()])
print('A RESULTADO', state(o, d, ride)); cleanup(o, d, ride)

# --- B: 3 motoristas × o motor aumentando o preço ao mesmo tempo
x = setup('conc-B'); o, d, ride = x['order'], x['dispatch'], x['ride']
res = {}
def engine(): res['e'] = run(f"begin; select set_config('app.skip_delivery_ping','1',true); update order_delivery_dispatches set offer_expires_at = now() - interval '1 second', last_price_change_at = now() - interval '1 day' where id = '{d}'; select _advance_delivery_search_v2('{d}'); select pg_sleep(2); commit; select 1 as ok;", 'v2_eng')
ts = [threading.Thread(target=apply, args=(dr, i)) for i, dr in enumerate(drivers)] + [threading.Thread(target=engine)]; [t.start() for t in ts]; [t.join() for t in ts]
print('B respostas:', [(k, v[0] if v[0] == 'ok' else v[1][:80]) for k, v in res.items()])
st = state(o, d, ride); print('B RESULTADO', st)
ok = int(st['aceitas']) <= 1 and (st['preco_do_aceite'] is None or (st['preco_do_aceite'].replace('.00', '') in st['entrega'].split('frozen=')[1].split(' ')[0].replace('.00', '')))
print('B invariante (≤1 vencedor e frozen = valor aceito):', ok); cleanup(o, d, ride); print('limpeza ok')
