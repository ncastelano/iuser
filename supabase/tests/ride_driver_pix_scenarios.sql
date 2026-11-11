-- Cenários do Pix do motorista para o passageiro (20261130000066). Transação desfeita; só LOCAL/staging.
begin;
create temp table t_ids as
select (select p.id from profiles p join auth.users u on u.id = p.id where u.email like 'cliente-%' order by p.id limit 1) as pax,
       (select p.id from profiles p join auth.users u on u.id = p.id where u.email like 'cliente-%' order by p.id offset 1 limit 1) as stranger,
       (select driver_id from driver_vehicles where vehicle_kind = 'carro' order by driver_id limit 1) as d1,
       (select driver_id from driver_vehicles where vehicle_kind = 'carro' order by driver_id offset 1 limit 1) as d2;
grant select on t_ids to authenticated;
update ride_requests set status = 'cancelled', cancelled_by = 'requester' where requester_id = (select pax from t_ids) and status in ('pending','accepted');
delete from driver_payout_keys where driver_id in (select d1 from t_ids union select d2 from t_ids);
insert into driver_payout_keys (driver_id, pix_key_type, pix_key, consent_at) select d1, 'phone', '69999990000', now() from t_ids;
insert into ride_requests (id, requester_id, ride_type, origin_address, destination_address, status, passenger_count, vehicle_type, payment_method, distance_km, duration_min)
select '00000000-0000-0000-0000-0000000000a1', pax, 'pessoa', 'A', 'B', 'pending', 1, 'carro', 'pix', 4, 10 from t_ids;
insert into ride_applications (ride_request_id, applicant_id, proposed_price, status)
select '00000000-0000-0000-0000-0000000000a1'::uuid, d1, 15, 'pending' from t_ids union all
select '00000000-0000-0000-0000-0000000000a1'::uuid, d2, 16, 'pending' from t_ids;

create function pg_temp.as_(uid uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', uid::text, true), set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true) $$;

-- 1) passageiro vê só o candidato COM chave
select pg_temp.as_((select pax from t_ids)); set local role authenticated;
do $$ begin assert (select array_agg(x) from get_ride_applicants_pix('00000000-0000-0000-0000-0000000000a1') x) = array[(select d1 from t_ids)], '1: lista de quem tem Pix'; end $$;
-- 2) pendente: a chave ainda não sai
do $$ begin assert get_ride_driver_pix('00000000-0000-0000-0000-0000000000a1') is null, '2: pendente não mostra a chave'; end $$;
reset role;
-- 3) escolhido d1: a chave sai
update ride_requests set status = 'accepted', driver_id = (select d1 from t_ids) where id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.as_((select pax from t_ids)); set local role authenticated;
do $$ begin assert get_ride_driver_pix('00000000-0000-0000-0000-0000000000a1')->>'key' = '69999990000', '3: passageiro vê a chave'; end $$;
reset role;
-- 4) estranho não vê nada
select pg_temp.as_((select stranger from t_ids)); set local role authenticated;
do $$ begin assert get_ride_driver_pix('00000000-0000-0000-0000-0000000000a1') is null, '4a: estranho'; assert (select count(*) from get_ride_applicants_pix('00000000-0000-0000-0000-0000000000a1')) = 0, '4b: estranho lista'; end $$;
reset role;
-- 5) pagamento em dinheiro: nada
update ride_requests set payment_method = 'dinheiro' where id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.as_((select pax from t_ids)); set local role authenticated;
do $$ begin assert get_ride_driver_pix('00000000-0000-0000-0000-0000000000a1') is null, '5: dinheiro não mostra'; end $$;
reset role;
-- 6) motorista sem chave: registered=false
update ride_requests set payment_method = 'pix', driver_id = (select d2 from t_ids) where id = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.as_((select pax from t_ids)); set local role authenticated;
do $$ begin assert (get_ride_driver_pix('00000000-0000-0000-0000-0000000000a1')->>'registered')::boolean = false, '6: sem chave'; end $$;
reset role;
-- 7) anon não executa
do $$ begin assert not has_function_privilege('anon', 'public.get_ride_driver_pix(uuid)', 'execute'), '7: anon'; end $$;
select 'ride_driver_pix: 7 cenários OK';
rollback;
