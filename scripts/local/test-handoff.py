#!/usr/bin/env python3
"""Cenários do banco para a RETIRADA POR CÓDIGO, o VOLUME e o painel de entregas da loja (migration 20261130000003) — só no Supabase LOCAL.
Roda tudo numa transação que é DESFEITA no fim (nada fica). Usa uma entrega aberta da pizzaria e um motorista iUser de teste.
  python3 scripts/local/test-handoff.py
"""
import json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import DB, DOCKER, ENV, q_local  # noqa: E402


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"


store = q_local("select id, owner_id from stores where \"storeSlug\" = 'pizzaria-forno-de-ouro'")[0]
drv = q_local("select u.id from auth.users u where u.email = 'entregador-dani@staging.iuser.test'")[0]['id']
stranger = q_local("select u.id from auth.users u where u.email = 'cliente-001@staging.iuser.test'")[0]['id']
rides = q_local(f"""select r.id, r.order_id from ride_requests r join orders o on o.id = r.order_id where r.status = 'pending' and r.driver_id is null
    and r.store_id = {esc(store['id'])}::uuid and o.status in ('preparing','ready') order by r.created_at desc limit 3""")
if len(rides) < 3:
    sys.exit('Preciso de 3 entregas abertas da pizzaria (rode o simulador ou crie pedidos e aceite-os como a loja).')
R1, R2, R3 = rides


def as_role(uid):
    claims = json.dumps({'sub': uid, 'role': 'authenticated'})
    return f"perform set_config('request.jwt.claim.sub', {esc(uid)}, true); perform set_config('request.jwt.claims', {esc(claims)}, true); execute 'set local role authenticated';"


def case(name, uid, body, expect):
    """expect = 'ok' ou um trecho do HINT/mensagem do erro esperado. Cada caso roda num sub-bloco, como a pessoa (papel authenticated), e volta ao papel normal."""
    return f"""
do $$ declare v_msg text; v_hint text; v_res text;
begin
  {as_role(uid) if uid else ''}
  begin
    {body}
    v_res := 'ok';
  exception when others then
    get stacked diagnostics v_msg = message_text, v_hint = pg_exception_hint;
    v_res := 'erro: ' || coalesce(v_hint, '') || ' | ' || coalesce(v_msg, '');
  end;
  execute 'reset role';
  raise notice 'CASE§{name}§%§{expect}', v_res;
end $$;
"""


sql = f"""begin;
-- preparo (como o servidor): capacidade em volume folgada e a loja marca os pedidos como em preparo
update driver_vehicles set delivery_capacity = 5, delivery_capacity_units = 100 where driver_id = {esc(drv)}::uuid;
update orders set status = 'preparing' where id in ({esc(R1['order_id'])}::uuid, {esc(R2['order_id'])}::uuid, {esc(R3['order_id'])}::uuid) and status = 'ready';
"""
sql += case('1 aceita a entrega (cabe em volume)', drv, f"insert into ride_applications (ride_request_id, applicant_id, proposed_price) select r.id, {esc(drv)}::uuid, r.offered_price from ride_offers r where r.id = {esc(R1['id'])}::uuid;", 'ok')
sql += f"delete from delivery_pickup_codes where driver_id = {esc(drv)}::uuid;\n"
sql += case('2a chega na loja (gera o código)', drv, f"update ride_requests set driver_en_route = true, driver_departed_at = now(), driver_arrived_at = now() where id = {esc(R1['id'])}::uuid;", 'ok')
sql += case('2b o motorista vê o estado do pedido SÓ das corridas dele', drv, f"if (select count(*) from get_my_pickup_status(array[{esc(R1['id'])}::uuid, {esc(R2['id'])}::uuid])) <> 1 then raise exception 'esperava só a corrida dele'; end if; if (select order_status from get_my_pickup_status(array[{esc(R1['id'])}::uuid]) limit 1) not in ('preparing','ready') then raise exception 'estado inesperado'; end if;", 'ok')
sql += case('2c estranho não vê o estado do pedido de ninguém', stranger, f"if exists (select 1 from get_my_pickup_status(array[{esc(R1['id'])}::uuid])) then raise exception 'vazou'; end if;", 'ok')
sql += case('2d antes da retirada não há conversa', drv, f"perform send_delivery_message({esc(R1['id'])}::uuid, 'at_gate');", 'depois da retirada')
sql += case('2 não grava a retirada direto', drv, f"update ride_requests set ride_started_at = now() where id = {esc(R1['id'])}::uuid;", 'pickup_code_required')
sql += f"""
select 'CODE|' || coalesce((select code from delivery_pickup_codes where store_id = {esc(store['id'])}::uuid and driver_id = {esc(drv)}::uuid and used_at is null), 'SEM CÓDIGO');
"""
sql += case('3 loja (dono) enxerga o código', store['owner_id'], f"if (select count(*) from get_store_pickup_codes({esc(store['id'])}::uuid)) <> 1 then raise exception 'esperava 1 código'; end if;", 'ok')
sql += case('4 estranho NÃO enxerga o código', stranger, f"perform * from get_store_pickup_codes({esc(store['id'])}::uuid);", '42501|Só o dono')
sql += f"update orders set status = 'ready' where id = {esc(R1['order_id'])}::uuid;\n"
sql += case('5 código errado (devolve wrong_code e conta a tentativa)', drv, f"if confirm_pickup(array[{esc(R1['id'])}::uuid], '----')->>'error' is distinct from 'wrong_code' then raise exception 'esperava wrong_code'; end if;", 'ok')
sql += f"update orders set status = 'preparing' where id = {esc(R1['order_id'])}::uuid;\n"
sql += f"select set_config('t.code', (select code from delivery_pickup_codes where driver_id = {esc(drv)}::uuid and used_at is null), false);\n"
sql += case('6 código certo mas pedido em preparo', drv, f"perform confirm_pickup(array[{esc(R1['id'])}::uuid], current_setting('t.code'));", 'order_not_ready')
sql += f"update orders set status = 'ready' where id = {esc(R1['order_id'])}::uuid;\n"
sql += case('7 painel da loja mostra o motorista e a saída', store['owner_id'], f"if jsonb_array_length((get_store_delivery_board({esc(store['id'])}::uuid)->'drivers')) < 1 then raise exception 'painel sem motorista'; end if;", 'ok')
sql += f"select set_config('t.code', (select code from delivery_pickup_codes where driver_id = {esc(drv)}::uuid and used_at is null), false);\n"
sql += case('8 retirada com o código certo e pedido pronto', drv, f"if (confirm_pickup(array[{esc(R1['id'])}::uuid], current_setting('t.code'))->>'ok')::boolean is not true then raise exception 'esperava ok'; end if;", 'ok')
sql += f"""
select 'STARTED|' || (select (ride_started_at is not null)::text from ride_requests where id = {esc(R1['id'])}::uuid);
"""
buyer = q_local(f"select buyer_id from orders where id = {esc(R1['order_id'])}::uuid")[0]['buyer_id']
DEST = f"(select destination_lat from ride_requests where id = {esc(R1['id'])}::uuid), (select destination_lng from ride_requests where id = {esc(R1['id'])}::uuid)"
FAR = f"(select destination_lat + 0.01 from ride_requests where id = {esc(R1['id'])}::uuid), (select destination_lng from ride_requests where id = {esc(R1['id'])}::uuid)"
sql += case('8a concluir SEM avisar "Estou no local" é recusado', drv, f"perform complete_ride({esc(R1['id'])}::uuid, {DEST});", 'arrival_required')
sql += case('8b "Estou no local" longe do endereço é recusado', drv, f"perform arrive_at_destination({esc(R1['id'])}::uuid, {FAR});", 'até 150 m')
sql += case('8c gravar a coluna direto é negado', drv, f"update ride_requests set arrived_destination_at = now() where id = {esc(R1['id'])}::uuid;", 'arrival_rpc_only')
sql += case('8d estranho não avisa pela entrega dos outros', stranger, f"perform arrive_at_destination({esc(R1['id'])}::uuid, {DEST});", 'Sem permissão')
sql += case('8e motorista na porta: "Estou no local"', drv, f"perform arrive_at_destination({esc(R1['id'])}::uuid, {DEST});", 'ok')
sql += case('8f o CLIENTE recebe o aviso de que o entregador chegou', buyer, "if not exists (select 1 from profile_notifications where profile_id = auth.uid() and kind = 'delivery_at_door' and created_at > now() - interval '1 minute') then raise exception 'cliente sem aviso'; end if;", 'ok')
sql += case('8g avisar de novo não duplica nem erra', drv, f"if (arrive_at_destination({esc(R1['id'])}::uuid, {DEST})->>'already')::boolean is not true then raise exception 'esperava already'; end if;", 'ok')
sql += case('8i motorista manda "Estou em frente" ao cliente', drv, f"perform send_delivery_message({esc(R1['id'])}::uuid, 'at_gate');", 'ok')
sql += case('8j o CLIENTE recebe a frase, com a resposta pronta de um toque', buyer, "if not exists (select 1 from profile_notifications where profile_id = auth.uid() and kind = 'delivery_message' and meta->>'reply_code' = 'coming' and created_at > now() - interval '1 minute') then raise exception 'cliente sem mensagem'; end if;", 'ok')
sql += case('8k o cliente responde "Já estou descendo"', buyer, f"perform send_delivery_message({esc(R1['id'])}::uuid, 'coming');", 'ok')
sql += case('8l o motorista recebe a resposta', drv, "if not exists (select 1 from profile_notifications where profile_id = auth.uid() and kind = 'delivery_message' and meta->>'text' like '%descendo%' and created_at > now() - interval '1 minute') then raise exception 'motorista sem resposta'; end if;", 'ok')
sql += case('8m "Ninguém atende" avisa também a LOJA', drv, f"perform send_delivery_message({esc(R1['id'])}::uuid, 'no_answer');", 'ok')
sql += case('8n a loja recebe "Entrega com problema"', store['owner_id'], "if not exists (select 1 from profile_notifications where profile_id = auth.uid() and kind = 'delivery_issue' and created_at > now() - interval '1 minute') then raise exception 'loja sem aviso'; end if;", 'ok')
sql += case('8o frase do cliente não vale para o motorista', drv, f"perform send_delivery_message({esc(R1['id'])}::uuid, 'coming');", 'Mensagem inválida')
sql += case('8p estranho não participa da conversa', stranger, f"perform send_delivery_message({esc(R1['id'])}::uuid, 'coming');", 'Sem permissão')
sql += case('8q estranho não lê as mensagens da entrega', stranger, f"if exists (select 1 from delivery_messages where ride_id = {esc(R1['id'])}::uuid) then raise exception 'vazou'; end if;", 'ok')
sql += case('8r a loja lê a conversa da entrega dela', store['owner_id'], f"if (select count(*) from delivery_messages where ride_id = {esc(R1['id'])}::uuid) < 3 then raise exception 'loja sem a conversa'; end if;", 'ok')
sql += case('8s não dá para escrever direto na tabela', drv, f"insert into delivery_messages (ride_id, sender_id, sender_role, code) values ({esc(R1['id'])}::uuid, auth.uid(), 'driver', 'at_gate');", 'permission denied|row-level|42501')
sql += case('8h depois do aviso, conclui a entrega', drv, f"perform complete_ride({esc(R1['id'])}::uuid, {DEST});", 'ok')
sql += f"update orders set status = 'ready' where id = {esc(R2['order_id'])}::uuid;\n"
sql += case('9a segunda entrega: aceita e chega', drv, f"insert into ride_applications (ride_request_id, applicant_id, proposed_price) select r.id, {esc(drv)}::uuid, r.offered_price from ride_offers r where r.id = {esc(R2['id'])}::uuid; update ride_requests set driver_en_route = true, driver_departed_at = now(), driver_arrived_at = now() where id = {esc(R2['id'])}::uuid;", 'ok')
sql += case('9 segunda saída: 5 erros travam', drv, f"""
    for i in 1..5 loop perform confirm_pickup(array[{esc(R2['id'])}::uuid], '----'); end loop;
    if confirm_pickup(array[{esc(R2['id'])}::uuid], '----')->>'error' is distinct from 'code_locked' then raise exception 'esperava code_locked'; end if;""", 'ok')
sql += f"update driver_vehicles set delivery_capacity_units = 0.5 where driver_id = {esc(drv)}::uuid;\n"
sql += case('10 não cabe em volume', drv, f"insert into ride_applications (ride_request_id, applicant_id, proposed_price) select r.id, {esc(drv)}::uuid, r.offered_price from ride_offers r where r.id = {esc(R3['id'])}::uuid;", 'delivery_capacity_units_full')
sql += "rollback;\n"

p = subprocess.run([DOCKER, 'exec', '-i', DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-At'], input=sql, capture_output=True, text=True, env=ENV)
out = p.stdout + '\n' + p.stderr
if p.returncode != 0 and 'CASE|' not in out:
    print(out[-1500:]); sys.exit(1)
fail = 0
for line in out.splitlines():
    if line.startswith(('CODE|', 'STARTED|')):
        print('  ·', line)
    if 'CASE§' not in line:
        continue
    name, res, expect = line.split('CASE§', 1)[1].split('§')
    good = (res == 'ok' and expect == 'ok') or (expect != 'ok' and res.startswith('erro') and any(e in res for e in expect.split('|')))
    fail += 0 if good else 1
    print(('✔' if good else '✖'), name, '' if good else f'→ {res}  (esperado: {expect})')
print('\nTUDO CERTO' if fail == 0 else f'\n{fail} FALHA(S)')
sys.exit(1 if fail else 0)
