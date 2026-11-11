-- Cenários: entregador desiste depois de aceitar → a entrega volta a procurar (20261130000067). Transação desfeita; só LOCAL/staging.
begin;
create temp table t as
select r.id as ride, r.driver_id as drv, r.order_id as ord, r.offered_price as price, d.id as disp,
       (select dp.driver_id from driver_pricing dp join driver_vehicles v on v.driver_id = dp.driver_id
         where dp.driver_mode_active and v.vehicle_kind = 'moto' and dp.driver_id <> r.driver_id
           and not exists (select 1 from ride_requests x where x.driver_id = dp.driver_id and x.status = 'accepted') limit 1) as other
  from ride_requests r join order_delivery_dispatches d on d.ride_request_id = r.id join orders o on o.id = r.order_id
 where r.status = 'accepted' and r.ride_started_at is null and d.flow_version = 1 and o.status in ('pending','preparing','ready')
 order by r.created_at desc limit 1;
grant select on t to authenticated;
do $$ begin assert (select count(*) from t) = 1, 'precisa de uma entrega aceita e não retirada'; end $$;

create function pg_temp.as_(uid uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', uid::text, true), set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true) $$;
create temp table ev0 as select count(*) n from order_delivery_events where dispatch_id = (select disp from t) and kind = 'round_started';

-- 1) o entregador desiste
select pg_temp.as_((select drv from t)); set local role authenticated;
update ride_requests set status = 'cancelled', cancelled_by = 'driver' where id = (select ride from t);
reset role;
do $$ begin
  assert (select status from ride_requests where id = (select ride from t)) = 'pending', '1a: corrida volta a pendente';
  assert (select driver_id from ride_requests where id = (select ride from t)) is null, '1b: sem motorista';
  assert (select status||'/'||stage from order_delivery_dispatches where id = (select disp from t)) = 'searching/searching', '1c: entrega procurando';
  assert (select status from ride_applications where ride_request_id = (select ride from t) and applicant_id = (select drv from t)) = 'rejected', '1d: quem desistiu fica rejeitado';
  assert (select count(*) from order_delivery_events where dispatch_id = (select disp from t) and kind = 'round_started') = (select n from ev0) + 1, '1e: motoristas avisados';
  assert (select status from orders where id = (select ord from t)) in ('pending','preparing','ready'), '1f: pedido segue';
  assert exists (select 1 from ride_offers where id = (select ride from t)), '1g: volta à lista dos motoristas';
end $$;

-- 2) quem desistiu não pega de novo
select pg_temp.as_((select drv from t)); set local role authenticated;
do $$ begin
  begin
    insert into ride_applications (ride_request_id, applicant_id, proposed_price) values ((select ride from t), (select drv from t), (select price from t));
    raise exception 'deveria recusar';
  exception when unique_violation then null; when others then if sqlerrm = 'deveria recusar' then raise; end if;
  end;
end $$;
reset role;

-- 3) outro entregador pega pelo frete e fica com ela
select pg_temp.as_((select other from t)); set local role authenticated;
insert into ride_applications (ride_request_id, applicant_id, proposed_price) values ((select ride from t), (select other from t), (select price from t));
reset role;
do $$ begin
  assert (select driver_id from ride_requests where id = (select ride from t)) = (select other from t), '3a: o novo entregador ficou com a entrega';
  assert (select status from order_delivery_dispatches where id = (select disp from t)) = 'accepted', '3b: entrega aceita de novo';
end $$;
select 'delivery_reopen: 3 grupos OK';
rollback;
