#!/usr/bin/env python3
"""Cenários do banco para o CAIXA do entregador (dinheiro e maquininha) e a CONTESTAÇÃO de entrega (migration 20261130000012) — só no Supabase LOCAL.
Roda tudo numa transação DESFEITA no fim. Usa 3 entregas abertas da pizzaria, a Dani (entregadora) e o dono da loja.
  python3 scripts/local/test-dues.py
"""

import json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import DB, DOCKER, ENV, q_local  # noqa: E402


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"




store = q_local("select id, owner_id, \"storeSlug\" as slug from stores where \"storeSlug\" = 'pizzaria-forno-de-ouro'")[0]
dani = q_local("select u.id from auth.users u where u.email = 'entregador-dani@staging.iuser.test'")[0]['id']
stranger = q_local("select u.id from auth.users u where u.email = 'cliente-001@staging.iuser.test'")[0]['id']
rides = q_local(f"""select r.id, r.order_id, o.buyer_id from ride_requests r join orders o on o.id = r.order_id where r.status = 'pending' and r.driver_id is null
    and r.store_id = {esc(store['id'])}::uuid and o.status in ('preparing','ready') and o.buyer_id <> {esc(stranger)}::uuid order by r.created_at desc limit 5""")
if len(rides) < 5:
    sys.exit('Preciso de 5 entregas abertas da pizzaria (rode o simulador ou crie pedidos e aceite-os como a loja).')
R1, R2, R3, R4, R5 = rides
S, OWN = esc(store['id']), store['owner_id']
def rid(r): return esc(r['id']) + '::uuid'
def oid(r): return esc(r['order_id']) + '::uuid'
def dest(r): return f"(select destination_lat from ride_requests where id = {rid(r)}), (select destination_lng from ride_requests where id = {rid(r)})"

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



def take(r, method, cash_for=None):
    """como o servidor: a Dani aceita a corrida, retira, chega à porta há 3 min e registra o código"""
    return (f"update orders set payment_method = {esc(method)} where id = {oid(r)};\n"
            f"update ride_requests set status = 'accepted', driver_id = {esc(dani)}::uuid, driver_en_route = true, driver_departed_at = now(), driver_arrived_at = now(), ride_started_at = now(), arrived_destination_at = now() - interval '3 minutes' where id = {rid(r)};\n")

def finish(r):
    return case('entrega concluída com o código', dani, f"perform submit_delivery_proof({rid(r)}, 'pin', (select '0000')) ;", 'ok')

sql = f"""begin;
update stores set pix_key = 'pix-da-loja@teste.iuser' where id = {S}::uuid;
update delivery_dues_settings set cash_max_open = 300, cash_due_hours = 24, machine_due_hours = 3, dispute_window_hours = 24, abuse_limit = 3, strike_limit = 3;
delete from store_dues where driver_id = {esc(dani)}::uuid;
update ride_requests set status = 'cancelled', cancelled_by = 'driver' where driver_id = {esc(dani)}::uuid and status = 'accepted' and order_id is not null;
delete from store_dues where driver_id = {esc(dani)}::uuid;
"""
# --- DINHEIRO
sql += take(R1, 'dinheiro')
sql += f"select set_config('t.pin1', (select pin from delivery_proofs where ride_id = {rid(R1)}), false);\n"
sql += case('1 Dani registra o código e conclui (dinheiro)', dani, f"perform submit_delivery_proof({rid(R1)}, 'pin', current_setting('t.pin1')); perform complete_ride({rid(R1)}, {dest(R1)});", 'ok')
sql += f"select set_config('t.due1', (select id::text from store_dues where ride_id = {rid(R1)}), false);\n"
sql += case('2 nasce o repasse = total − frete, com prazo', dani, f"if not exists (select 1 from jsonb_array_elements(get_my_dues()->'items') i where i->>'kind' = 'cash' and (i->>'amount')::numeric > 0 and i->>'status' = 'open') then raise exception 'sem repasse'; end if;", 'ok')
sql += f"select 'DUE|' || (select amount::text || ' de ' || collected::text || ' (frete ' || (select offered_price::text from ride_requests where id = {rid(R1)}) || ')' from store_dues where ride_id = {rid(R1)});\n"
sql += case('3 a Dani vê a chave Pix da loja para repassar', dani, f"if (get_due_remit_target(current_setting('t.due1')::uuid)->>'pix_key') is distinct from 'pix-da-loja@teste.iuser' then raise exception 'sem pix'; end if;", 'ok')
sql += case('4 estranho não vê a chave nem declara', stranger, f"perform get_due_remit_target(current_setting('t.due1')::uuid);", 'Sem permissão')
sql += case('5 forma inválida é recusada', dani, f"perform declare_due(current_setting('t.due1')::uuid, 'cartao');", 'Forma inválida')
sql += case('6 a Dani declara "repassei por Pix"', dani, f"perform declare_due(current_setting('t.due1')::uuid, 'pix');", 'ok')
sql += case('7 a loja vê o repasse a confirmar e é avisada', OWN, f"if not exists (select 1 from jsonb_array_elements(get_store_dues({S}::uuid)->'items') i where i->>'status' = 'declared') then raise exception 'loja sem repasse'; end if; if not exists (select 1 from profile_notifications where profile_id = auth.uid() and kind = 'dues_update' and created_at > now() - interval '1 minute') then raise exception 'sem aviso'; end if;", 'ok')
sql += case('8 estranho não lê o caixa da loja', stranger, f"perform get_store_dues({S}::uuid);", 'Sem permissão')
sql += case('9 "não recebi" exige dizer o que houve', OWN, f"perform confirm_due(current_setting('t.due1')::uuid, false, '');", 'Diga o que aconteceu')
sql += case('10 a loja contesta o repasse', OWN, f"perform confirm_due(current_setting('t.due1')::uuid, false, 'Não caiu o Pix');", 'ok')
sql += case('11 contestado: a Dani fica barrada de novas entregas', dani, f"insert into ride_applications (ride_request_id, applicant_id, proposed_price) select r.id, auth.uid(), r.offered_price from ride_offers r where r.id = {rid(R4)};", 'dues_disputed')
sql += f"select admin_decide_due(current_setting('t.due1')::uuid, 'confirmed', 'Pix conferido', {esc(OWN)}::uuid);\n"
sql += case('12 o admin resolve: a Dani é liberada', dani, f"insert into ride_applications (ride_request_id, applicant_id, proposed_price) select r.id, auth.uid(), r.offered_price from ride_offers r where r.id = {rid(R4)};", 'ok')
# limite e atraso (usa uma linha criada à mão como o servidor)
sql += f"insert into store_dues (kind, store_id, driver_id, order_id, amount, collected, due_at) values ('cash', {S}::uuid, {esc(dani)}::uuid, {oid(R3)}, 350, 400, now() + interval '5 hours');\n"
sql += case('13 mais de R$ 300 sem repassar barra (cash_limit)', dani, f"insert into ride_applications (ride_request_id, applicant_id, proposed_price) select r.id, auth.uid(), r.offered_price from ride_offers r where r.id = {rid(R5)};", 'cash_limit')
sql += case('13b o caixa mostra o bloqueio e o texto', dani, "if (get_my_dues()->>'blocked') is distinct from 'cash_limit' then raise exception 'esperava cash_limit'; end if;", 'ok')
sql += f"update store_dues set amount = 50, due_at = now() - interval '1 minute' where driver_id = {esc(dani)}::uuid and order_id = {oid(R3)};\n"
sql += case('14 repasse vencido barra (cash_overdue)', dani, "if (get_my_dues()->>'blocked') is distinct from 'cash_overdue' then raise exception 'esperava cash_overdue'; end if;", 'ok')
sql += f"delete from store_dues where driver_id = {esc(dani)}::uuid and order_id = {oid(R3)};\n"
# --- MAQUININHA
sql += take(R2, 'cartao')
sql += case('15 pedido de cartão retirado: a maquininha sai com a Dani', None, f"if (select count(*) from store_dues where kind = 'machine' and driver_id = {esc(dani)}::uuid and status = 'open' and due_at is null) <> 1 then raise exception 'sem maquininha'; end if;", 'ok')
sql += f"select 'R2S0|' || status from ride_requests where id = {rid(R2)};\n"
sql += f"select set_config('t.pin2', (select pin from delivery_proofs where ride_id = {rid(R2)}), false);\n"
sql += case('16 entrega de cartão concluída: não há repasse (o dinheiro vai à loja)', dani, f"perform submit_delivery_proof({rid(R2)}, 'pin', current_setting('t.pin2')); perform complete_ride({rid(R2)}, {dest(R2)});", 'ok')
sql += case('16b sem repasse em dinheiro no cartão (o valor vai direto à loja)', None, f"if exists (select 1 from store_dues where ride_id = {rid(R2)} and kind = 'cash') then raise exception 'repasse indevido'; end if;", 'ok')
sql += f"select set_config('t.mach', (select id::text from store_dues where kind = 'machine' and driver_id = {esc(dani)}::uuid and status = 'open'), false);\n"
sql += f"select 'R2S1|' || status from ride_requests where id = {rid(R2)};\n"
sql += case('17 acabou o cartão: corre o prazo de 3 h para devolver', dani, "if not exists (select 1 from jsonb_array_elements(get_my_dues()->'items') i where i->>'kind' = 'machine' and i->>'due_at' is not null) then raise exception 'sem prazo'; end if;", 'ok')
sql += f"update store_dues set due_at = now() - interval '1 minute' where kind = 'machine' and driver_id = {esc(dani)}::uuid;\n"
sql += case('18 maquininha não devolvida barra (machine_overdue)', dani, "if (get_my_dues()->>'blocked') is distinct from 'machine_overdue' then raise exception 'esperava machine_overdue'; end if;", 'ok')
sql += case('19 a Dani devolve; a loja confirma; liberada', dani, "perform declare_due(current_setting('t.mach')::uuid, 'devolvida');", 'ok')
sql += case('19b a loja confirma a devolução', OWN, f"perform confirm_due(current_setting('t.mach')::uuid, true);", 'ok')
sql += case('19c sem pendência: liberada', dani, "if (get_my_dues()->>'blocked') is not null then raise exception 'ainda barrada'; end if;", 'ok')
# --- CONTESTAÇÃO (R1 foi entregue há poucos segundos: dentro do prazo)
buyer1 = R1['buyer_id']
sql += case('20 estranho não contesta pedido de outro', stranger, f"perform open_delivery_dispute({oid(R1)}, 'not_received', 'x');", 'Sem permissão')
sql += case('21 motivo inválido é recusado', buyer1, f"perform open_delivery_dispute({oid(R1)}, 'zzz', 'x');", 'Motivo inválido')
sql += case('22 o cliente contesta ("não recebi") mesmo com a prova', buyer1, f"perform open_delivery_dispute({oid(R1)}, 'not_received', 'Não chegou nada aqui');", 'ok')
sql += f"select set_config('t.dsp1', (select id::text from delivery_disputes where order_id = {oid(R1)}), false);\n"
sql += case('23 não dá para contestar duas vezes', buyer1, f"perform open_delivery_dispute({oid(R1)}, 'not_received', 'de novo');", 'já foi contestado')
sql += case('24 a loja e a entregadora são avisadas', OWN, "if not exists (select 1 from profile_notifications where profile_id = auth.uid() and kind = 'dispute_update' and created_at > now() - interval '1 minute') then raise exception 'sem aviso'; end if;", 'ok')
sql += case('25 as evidências estão guardadas (prova, hora, distância)', OWN, f"if (get_delivery_dispute_view({oid(R1)})->'evidence'->>'proof_method') is distinct from 'pin' or (get_delivery_dispute_view({oid(R1)})->'evidence'->>'done_dist_m') is null then raise exception 'sem evidência'; end if;", 'ok')
sql += case('26 a evidência nunca traz o código', OWN, f"if (get_delivery_dispute_view({oid(R1)})::text) like '%' || current_setting('t.pin1') || '%' then raise exception 'vazou o código'; end if;", 'ok')
sql += case('27 a loja responde', OWN, f"perform reply_delivery_dispute((get_delivery_dispute_view({oid(R1)})->>'id')::uuid, 'Entregue com o código dele');", 'ok')
sql += case('28 a entregadora responde', dani, f"perform reply_delivery_dispute(current_setting('t.dsp1')::uuid, 'Ele disse o código na porta');", 'ok')
sql += case('29 estranho não responde nem vê', stranger, f"perform reply_delivery_dispute(current_setting('t.dsp1')::uuid, 'oi');", 'Sem permissão')
sql += f"select admin_decide_dispute(current_setting('t.dsp1')::uuid, 'driver_at_fault', 'Foto de outro lugar', {esc(OWN)}::uuid);\n"
sql += case('30 culpa da entregadora: dívida dos produtos com a loja', dani, f"if not exists (select 1 from jsonb_array_elements(get_my_dues()->'items') i where i->>'kind' = 'dispute_debt' and (i->>'amount')::numeric > 0) then raise exception 'sem dívida'; end if;", 'ok')
sql += case('31 o cliente vê a decisão e o reembolso pendente', buyer1, f"if (get_delivery_dispute_view({oid(R1)})->>'refund_status') is distinct from 'pending' or (get_delivery_dispute_view({oid(R1)})->>'outcome') is distinct from 'driver_at_fault' then raise exception 'estado errado'; end if;", 'ok')
sql += case('32 a loja declara o reembolso', OWN, f"perform declare_dispute_refund(current_setting('t.dsp1')::uuid, 'pix');", 'ok')
sql += case('33 o cliente confirma que recebeu', buyer1, f"perform confirm_dispute_refund(current_setting('t.dsp1')::uuid, true);", 'ok')
sql += case('34 estado final: reembolso confirmado', buyer1, f"if (get_delivery_dispute_view({oid(R1)})->>'refund_status') is distinct from 'confirmed' then raise exception 'não confirmou'; end if;", 'ok')
# prazo: R2 foi concluída há segundos → forço 30 h atrás
sql += f"update delivery_proofs set done_at = now() - interval '30 hours' where ride_id = {rid(R2)};\n"
sql += case('35 fora do prazo (24 h) não dá para contestar', R2['buyer_id'], f"perform open_delivery_dispute({oid(R2)}, 'not_received', 'tarde');", 'prazo')
# abuso: 3 recusadas travam
sql += f"""update delivery_dues_settings set abuse_limit = 1;
update delivery_proofs set done_at = now() - interval '1 hour' where ride_id = {rid(R2)};
select open_delivery_dispute_as_postgres_dummy;
"""
sql = sql.replace("select open_delivery_dispute_as_postgres_dummy;\n", "")
sql += case('36 abrir a 2ª contestação (cliente do R2)', R2['buyer_id'], f"perform open_delivery_dispute({oid(R2)}, 'incomplete', 'faltou item');", 'ok')
sql += f"select admin_decide_dispute((select id from delivery_disputes where order_id = {oid(R2)}), 'rejected', 'Prova válida', {esc(OWN)}::uuid);\n"
sql += case('37 contestação recusada não gera dívida nem culpa', dani, "if exists (select 1 from jsonb_array_elements(get_my_dues()->'items') i where i->>'kind' = 'dispute_debt' and i->>'id' is null) then raise exception 'x'; end if;", 'ok')
sql += "rollback;\n"

if os.environ.get('DUMP'):
    open(os.environ['DUMP'], 'w').write(sql); sys.exit(0)
p = subprocess.run([DOCKER, 'exec', '-i', DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-At'], input=sql, capture_output=True, text=True, env=ENV)
out = p.stdout + '\n' + p.stderr
if p.returncode != 0 and 'CASE|' not in out:
    print(out[-1500:]); sys.exit(1)
fail = 0
for line in out.splitlines():
    if line.startswith(('DUE|', 'R2STATUS')):
        print('  ·', line)
    if 'CASE§' not in line:
        continue
    name, res, expect = line.split('CASE§', 1)[1].split('§')
    good = (res == 'ok' and expect == 'ok') or (expect != 'ok' and res.startswith('erro') and any(e in res for e in expect.split('|')))
    fail += 0 if good else 1
    print(('✔' if good else '✖'), name, '' if good else f'→ {res}  (esperado: {expect})')
print('\nTUDO CERTO' if fail == 0 else f'\n{fail} FALHA(S)')
sys.exit(1 if fail else 0)
