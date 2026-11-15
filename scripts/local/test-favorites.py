#!/usr/bin/env python3
"""Cenários do banco para os MOTORISTAS FAVORITOS da loja e a janela de exclusividade (migration 20261130000009) — só no Supabase LOCAL.
Roda tudo numa transação que é DESFEITA no fim (nada fica). Usa duas entregas abertas da pizzaria e dois motoristas iUser de teste (Dani favorita, Léo não).
  python3 scripts/local/test-favorites.py
"""
import json, os, re, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import DB, DOCKER, ENV, q_local  # noqa: E402


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"



store = q_local("select id, owner_id, \"storeSlug\" as slug, store_lat, store_lng from stores where \"storeSlug\" = 'pizzaria-forno-de-ouro'")[0]
dani = q_local("select u.id from auth.users u where u.email = 'entregador-dani@staging.iuser.test'")[0]['id']
leo = q_local("select u.id from auth.users u where u.email = 'entregador-leo@staging.iuser.test'")[0]['id']
leo_slug = q_local(f"select \"profileSlug\" as s from profiles where id = {esc(leo)}::uuid")[0]['s']
stranger = q_local("select u.id from auth.users u where u.email = 'cliente-001@staging.iuser.test'")[0]['id']
not_driver = q_local("select p.id from profiles p where p.id not in (select driver_id from driver_pricing) and p.id not in (select driver_id from driver_vehicles) and p.id <> '" + stranger + "' limit 1")[0]['id']
rides = q_local(f"""select r.id, r.order_id from ride_requests r join orders o on o.id = r.order_id where r.status = 'pending' and r.driver_id is null
    and r.store_id = {esc(store['id'])}::uuid and o.status in ('preparing','ready') order by r.created_at desc limit 3""")
if len(rides) < 3:
    sys.exit('Preciso de 3 entregas abertas da pizzaria (rode o simulador ou crie pedidos e aceite-os como a loja).')
R1, R2, R3 = rides
S, OWN = esc(store['id']), store['owner_id']


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


def vis(rid):
    return f"(select count(*) from ride_offers where id = {esc(rid)}::uuid)"


sql = f"""begin;
-- preparo (como o servidor): os dois motoristas online, perto da loja, com mochila folgada; a loja sem favoritos
update driver_pricing set driver_mode_active = true, live_location_sync = true, live_lat = {store['store_lat']}, live_lng = {store['store_lng']}, live_updated_at = now() where driver_id in ({esc(dani)}::uuid, {esc(leo)}::uuid);
update driver_vehicles set delivery_capacity = 5, delivery_capacity_units = 100 where driver_id in ({esc(dani)}::uuid, {esc(leo)}::uuid);
delete from store_favorite_drivers where store_id = {S}::uuid;
delete from store_favorite_settings where store_id = {S}::uuid;
update ride_requests set exclusive_until = null, exclusive_released_at = null where id in ({esc(R1['id'])}::uuid, {esc(R2['id'])}::uuid, {esc(R3['id'])}::uuid);
"""
# --- convites
sql += case('1 estranho não convida pela loja dos outros', stranger, f"perform store_add_favorite_driver({S}::uuid, {esc(dani)}::uuid);", 'Sem permissão')
sql += case('2 a dona não se convida', OWN, f"perform store_add_favorite_driver({S}::uuid, auth.uid());", 'não pode se convidar')
sql += case('3 não convida quem não é motorista', OWN, f"perform store_add_favorite_driver({S}::uuid, {esc(not_driver)}::uuid);", 'não é motorista')
sql += case('4 a dona convida a Dani', OWN, f"if store_add_favorite_driver({S}::uuid, {esc(dani)}::uuid) <> 'invited' then raise exception 'esperava invited'; end if;", 'ok')
sql += case('5 convidar de novo não duplica', OWN, f"if store_add_favorite_driver({S}::uuid, {esc(dani)}::uuid) <> 'invited' then raise exception 'esperava invited'; end if;", 'ok')
sql += case('6 a Dani recebe o convite na ilha', dani, "if not exists (select 1 from profile_notifications where profile_id = auth.uid() and kind = 'favorite_invite' and created_at > now() - interval '1 minute') then raise exception 'sem aviso'; end if;", 'ok')
sql += case('7 a Dani vê o convite na Central', dani, f"if not exists (select 1 from get_my_favorite_stores() where store_id = {S}::uuid and status = 'invited') then raise exception 'sem convite'; end if;", 'ok')
sql += case('8 quem não foi convidado não responde', leo, f"perform respond_favorite_invite({S}::uuid, true);", 'Convite não encontrado')
sql += case('9 ninguém lê a tabela direto', dani, f"perform * from store_favorite_drivers;", 'permission denied|42501')
# convidada ainda NÃO é favorita: sem janela
sql += f"select 'EXCL0|' || coalesce((_exclusive_until_for({S}::uuid, {store['store_lat']}, {store['store_lng']}, 10, 'favorites'))::text, 'nenhuma');\n"
sql += case('10 a Dani aceita o convite', dani, f"perform respond_favorite_invite({S}::uuid, true);", 'ok')
sql += case('11 a dona recebe "novo entregador favorito"', OWN, "if not exists (select 1 from profile_notifications where profile_id = auth.uid() and kind = 'favorite_accepted' and created_at > now() - interval '1 minute') then raise exception 'sem aviso'; end if;", 'ok')
sql += case('12 painel da loja lista a Dani como favorita', OWN, f"if not exists (select 1 from jsonb_array_elements(get_store_favorites({S}::uuid)->'items') i where i->>'status' = 'accepted') then raise exception 'sem favorita'; end if;", 'ok')
sql += case('13 estranho não lê os favoritos da loja', stranger, f"perform get_store_favorites({S}::uuid);", 'Sem permissão')
sql += case('14 busca por @ acha o Léo (não favorito)', OWN, f"if not exists (select 1 from suggest_favorite_drivers({S}::uuid, {esc(leo_slug)})) then raise exception 'não achou o Léo'; end if;", 'ok')
sql += case('15 a busca não devolve quem já é favorito', OWN, f"if exists (select 1 from suggest_favorite_drivers({S}::uuid, 'dani') where driver_id = {esc(dani)}::uuid) then raise exception 'devolveu a favorita'; end if;", 'ok')
sql += case('16 estranho não busca em nome da loja', stranger, f"perform * from suggest_favorite_drivers({S}::uuid, 'a');", 'Sem permissão')
# --- ajustes
sql += case('17 ajuste inválido (90 s) é recusado', OWN, f"perform set_store_favorites_settings({S}::uuid, true, 90);", 'Tempo inválido')
sql += case('18 estranho não muda os ajustes', stranger, f"perform set_store_favorites_settings({S}::uuid, false, 60);", 'Sem permissão')
sql += case('19 a dona escolhe 3 minutos', OWN, f"perform set_store_favorites_settings({S}::uuid, true, 180); if (get_store_favorites({S}::uuid)->>'window_seconds')::int <> 180 then raise exception 'não gravou'; end if;", 'ok')
# --- janela (como o servidor)
sql += f"""
select 'MODE|' || (set_delivery_exclusivity({esc(R1['order_id'])}::uuid, 'favorites'))::text;
select 'SECS|' || round(extract(epoch from ((select exclusive_until from ride_requests where id = {esc(R1['id'])}::uuid) - now())))::text;
"""
sql += case('20 durante a janela o Léo NÃO vê a entrega', leo, f"if {vis(R1['id'])} <> 0 then raise exception 'o Léo viu'; end if;", 'ok')
sql += case('21 durante a janela a Dani (favorita) vê a entrega', dani, f"if {vis(R1['id'])} <> 1 then raise exception 'a Dani não viu'; end if;", 'ok')
sql += case('22 o Léo não consegue aceitar (nem sabendo o id)', leo, f"insert into ride_applications (ride_request_id, applicant_id, proposed_price) values ({esc(R1['id'])}::uuid, auth.uid(), 1);", 'exclusive_window')
sql += case('23 a Dani vê a entrega marcada como exclusiva dela', dani, f"if not exists (select 1 from get_my_exclusive_offers() where ride_id = {esc(R1['id'])}::uuid) then raise exception 'sem selo'; end if;", 'ok')
sql += case('24 o Léo não tem entrega exclusiva', leo, "if exists (select 1 from get_my_exclusive_offers()) then raise exception 'vazou'; end if;", 'ok')
sql += case('25 a Dani aceita durante a janela (valor oferecido)', dani, f"insert into ride_applications (ride_request_id, applicant_id, proposed_price) select r.id, auth.uid(), r.offered_price from ride_offers r where r.id = {esc(R1['id'])}::uuid;", 'ok')
# fim da janela: abre para todos e o cron avisa uma vez
sql += f"update ride_requests set exclusive_until = now() - interval '1 second' where id = {esc(R2['id'])}::uuid;\n"
sql += case('26 fim da janela: o Léo passa a ver', leo, f"if {vis(R2['id'])} <> 1 then raise exception 'o Léo não viu'; end if;", 'ok')
sql += f"select 'TICK1|' || process_favorite_windows()::text;\nselect 'TICK2|' || process_favorite_windows()::text;\n"
sql += case('27 fim da janela: o Léo aceita', leo, f"insert into ride_applications (ride_request_id, applicant_id, proposed_price) select r.id, auth.uid(), r.offered_price from ride_offers r where r.id = {esc(R2['id'])}::uuid;", 'ok')
# escolha por pedido: Todos
sql += f"select 'ALL|' || (set_delivery_exclusivity({esc(R3['order_id'])}::uuid, 'all'))::text;\n"
sql += case('28 modo "Todos": o Léo vê a entrega', leo, f"if {vis(R3['id'])} <> 1 then raise exception 'o Léo não viu'; end if;", 'ok')
# sem favorito disponível: nada de janela
sql += f"update driver_pricing set live_updated_at = now() - interval '2 hours' where driver_id = {esc(dani)}::uuid;\n"
sql += f"select 'OFF|' || (set_delivery_exclusivity({esc(R3['order_id'])}::uuid, 'favorites'))::text;\n"
sql += case('29 favorita offline: a entrega fica aberta (sem janela)', leo, f"if {vis(R3['id'])} <> 1 then raise exception 'o Léo não viu'; end if;", 'ok')
sql += f"update driver_pricing set live_updated_at = now() where driver_id = {esc(dani)}::uuid;\n"
# loja desliga "favoritos primeiro": a oferta nasce aberta
sql += f"update store_favorite_settings set favorites_first = false where store_id = {S}::uuid;\n"
sql += f"select 'DEF|' || coalesce((_exclusive_until_for({S}::uuid, {store['store_lat']}, {store['store_lng']}, 10, NULL))::text, 'nenhuma');\n"
sql += f"select 'FORCED|' || (case when _exclusive_until_for({S}::uuid, {store['store_lat']}, {store['store_lng']}, 10, 'favorites') is not null then 'janela' else 'nenhuma' end);\n"
# remover / sair
sql += case('30 a Dani sai da lista', dani, f"perform leave_favorite({S}::uuid); if exists (select 1 from get_my_favorite_stores() where store_id = {S}::uuid) then raise exception 'ainda na lista'; end if;", 'ok')
sql += case('31 a dona recebe o aviso de saída', OWN, "if not exists (select 1 from profile_notifications where profile_id = auth.uid() and kind = 'favorite_declined' and created_at > now() - interval '1 minute') then raise exception 'sem aviso'; end if;", 'ok')
sql += case('32 a dona convida o Léo e remove', OWN, f"perform store_add_favorite_driver({S}::uuid, {esc(leo)}::uuid); perform store_remove_favorite_driver({S}::uuid, {esc(leo)}::uuid);", 'ok')
sql += "rollback;\n"

p = subprocess.run([DOCKER, 'exec', '-i', DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-At'], input=sql, capture_output=True, text=True, env=ENV)
out = p.stdout + '\n' + p.stderr
if p.returncode != 0 and 'CASE|' not in out:
    print(out[-1500:]); sys.exit(1)
fail = 0
for line in out.splitlines():
    if line.startswith(('EXCL0|', 'MODE|', 'SECS|', 'TICK1|', 'TICK2|', 'ALL|', 'OFF|', 'DEF|', 'FORCED|')):
        print('  ·', line)
    if 'CASE§' not in line:
        continue
    name, res, expect = line.split('CASE§', 1)[1].split('§')
    good = (res == 'ok' and expect == 'ok') or (expect != 'ok' and res.startswith('erro') and any(e in res for e in expect.split('|')))
    fail += 0 if good else 1
    print(('✔' if good else '✖'), name, '' if good else f'→ {res}  (esperado: {expect})')
print('\nTUDO CERTO' if fail == 0 else f'\n{fail} FALHA(S)')
sys.exit(1 if fail else 0)
