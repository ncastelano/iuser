# Etapa 2.4: aceite concorrente REAL (3 motoristas ao mesmo tempo → 1 vencedor). Cria um pedido de teste da loja iUser com os bots
# (lucy, loja de Mc Donald's, natancastelano + 2 perfis de teste), roda 3 conexões paralelas e APAGA o que criou. Precisa do CLI do Supabase linkado.
# Rodar: python3 supabase/tests/concurrent_accept.py

import subprocess, json, re, os, threading, sys, time
env=dict(os.environ); env.pop('SUPABASE_ACCESS_TOKEN',None)
cwd=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
S=os.environ.get('TMPDIR','/tmp').rstrip('/')+'/'
def run(sql, name):
    path=S+name+'.sql'; open(path,'w').write(sql)
    r=subprocess.run(['npx','supabase','db','query','--linked','-f',path],capture_output=True,text=True,env=env,cwd=cwd)
    out=r.stdout+r.stderr
    m=re.search(r'^\{.*?^\}',out,re.S|re.M)
    if m and '"rows"' in m.group(0): return ('ok', json.loads(m.group(0))['rows'])
    mm=re.search(r'message":"(.*?)"\}',out); return ('err', (mm.group(1) if mm else out[:300]).replace('\\n',' '))
def q(sql,name='q'): 
    s,v=run(sql,name); 
    if s!='ok': raise SystemExit('ERR '+str(v))
    return v
ST='93e432b4-0472-4ae4-abb1-45b516e2f7bd'; PROD='bdf2d5b5-3879-4c8f-bd9a-6a6241b24570'
setup=f"""
create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $f$ begin perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role','authenticated')::text, true); end $f$;
do $$ declare cust uuid; owner uuid; j jsonb; o uuid; ride uuid; d1 uuid; d2 uuid; d3 uuid; a1 uuid; a2 uuid; a3 uuid;
begin
  select id into cust from profiles where "profileSlug"='lucy'; select owner_id into owner from stores where id='{ST}';
  select id into d1 from profiles where "profileSlug"='natancastelano';
  select id into d2 from profiles where id not in (cust,owner,d1) order by id limit 1;
  select id into d3 from profiles where id not in (cust,owner,d1,d2) order by id limit 1;
  perform pg_temp.as_user(cust); set local role authenticated;
  j := create_store_order('{ST}', '[{{"product_id":"{PROD}","quantity":1}}]'::jsonb,'entrega','pix','Rua Dom Pedro II, 800, Porto Velho',-8.7860,-63.8760,null,null,null,null);
  reset role; o := (j->>'order_id')::uuid;
  perform pg_temp.as_user(owner); set local role authenticated; update orders set status='preparing' where id=o; reset role;
  select ride_request_id into ride from order_delivery_dispatches where order_id=o;
  perform set_config('app.res', json_build_object('order',o,'ride',ride,'owner',owner,'d1',d1,'d2',d2,'d3',d3)::text, false);
end $$;
select json_build_object('order',o.id,'ride',d.ride_request_id,'owner',s.owner_id) j
 from orders o join order_delivery_dispatches d on d.order_id=o.id join stores s on s.id=o.store_id where o.store_id='{ST}' and o.buyer_id=(select id from profiles where "profileSlug"='lucy') order by o.created_at desc limit 1;
"""
j=q(setup,'c_setup')[0]['j']; o,ride,owner=j['order'],j['ride'],j['owner']
print('setup: ride',ride[:8])
drivers=[r['id'] for r in q(f"""select id from (select id from profiles where "profileSlug"='natancastelano' union all select id from (select id from profiles where id not in ('{owner}',(select id from profiles where "profileSlug"='lucy'),(select id from profiles where "profileSlug"='natancastelano')) order by id limit 2) x) y""",'c_drv')]
print('drivers',len(drivers))
# 1) candidaturas simultaneas
def ins(d,i):
    res[i]=run(f"begin; insert into ride_applications(ride_request_id, applicant_id, status, proposed_price) select '{ride}','{d}','pending',offered_price from ride_requests where id='{ride}'; select pg_sleep(2); commit; select 1 as ok;",f'c_ins{i}')
res={}
ts=[threading.Thread(target=ins,args=(d,i)) for i,d in enumerate(drivers)]; [t.start() for t in ts]; [t.join() for t in ts]
print('inserts',[r[0] for r in res.values()])
apps=q(f"select id, applicant_id, status from ride_applications where ride_request_id='{ride}' order by id",'c_apps'); print('apos as 3 candidaturas simultaneas:',[a['status'] for a in apps])
# 2) aceite simultaneo: o solicitante (loja) seleciona, N tentativas ao mesmo tempo, cada uma com candidatura diferente
def sel(a,i):
    res2[i]=run(f"begin; select set_config('request.jwt.claims', json_build_object('sub','{owner}','role','authenticated')::text, true); set local role authenticated; select select_ride_driver('{ride}','{a['id']}'); select pg_sleep(2.5); commit;",f'c_sel{i}')
res2={}
ts=[threading.Thread(target=sel,args=(a,i)) for i,a in enumerate(apps)]; [t.start() for t in ts]; [t.join() for t in ts]
for k,v in sorted(res2.items()): print('tentativa',k,v[0],str(v[1])[:400])
fin=q(f"""select (select count(*) from ride_applications where ride_request_id='{ride}' and status='accepted') aceitas,
 (select count(*) from ride_applications where ride_request_id='{ride}' and status='rejected') rejeitadas,
 (select count(*) from ride_applications where ride_request_id='{ride}' and status='pending') pendentes,
 (select status||' driver='||(driver_id is not null)::text from ride_requests where id='{ride}') corrida,
 (select count(*) from ride_requests where order_id='{o}' and status in ('accepted','in_progress','started')) corridas_ativas,
 (select status from order_delivery_dispatches where order_id='{o}') dispatch""",'c_fin')[0]
print('RESULTADO',fin)
# cleanup
q(f"""delete from order_delivery_events where dispatch_id in (select id from order_delivery_dispatches where order_id='{o}');
delete from order_delivery_rounds where dispatch_id in (select id from order_delivery_dispatches where order_id='{o}');
delete from order_delivery_counters where dispatch_id in (select id from order_delivery_dispatches where order_id='{o}');
delete from order_delivery_dispatches where order_id='{o}';
delete from driver_postpaid_charges where order_id='{o}' or ride_request_id='{ride}';
delete from ride_applications where ride_request_id='{ride}';
delete from ride_requests where id='{ride}';
delete from order_items where order_id='{o}';
delete from orders where id='{o}';
select (select count(*) from orders where id='{o}') o, (select count(*) from ride_requests where id='{ride}') r""",'c_clean')
print('limpeza ok')
