-- Cenários do ciclo das entregas (20261130000068). Transação desfeita; só LOCAL/staging (usa a pizzaria e os entregadores da massa local).
begin;
create function pg_temp.as_(uid uuid) returns void language sql as $$ select set_config('request.jwt.claim.sub', uid::text, true), set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true) $$;
create temp table t as
select s.id as store, s.owner_id as owner,
       (select p.id from profiles p join auth.users u on u.id = p.id where u.email like 'cliente-%' order by p.id limit 1) as buyer,
       (select p.id from profiles p join auth.users u on u.id = p.id where u.email like 'cliente-%' order by p.id offset 1 limit 1) as stranger
  from stores s where s."storeSlug" = 'pizzaria-forno-de-ouro';
grant select on t to authenticated;
-- a pizzaria aberta 24 h durante o teste (o horário dela não pode interferir nos outros cenários)
update stores set business_hours = '{"weekly":{"0":{"isOpen":true,"start":"00:00","end":"00:00"},"1":{"isOpen":true,"start":"00:00","end":"00:00"},"2":{"isOpen":true,"start":"00:00","end":"00:00"},"3":{"isOpen":true,"start":"00:00","end":"00:00"},"4":{"isOpen":true,"start":"00:00","end":"00:00"},"5":{"isOpen":true,"start":"00:00","end":"00:00"},"6":{"isOpen":true,"start":"00:00","end":"00:00"}}}'::jsonb where id = (select store from t);

-- 1) loja que não aceita: aviso aos 3 min, cancelamento aos 10
insert into orders (id, store_id, checkout_id, buyer_id, buyer_name, status, total_amount, delivery_option, store_visible)
select '00000000-0000-0000-0000-00000000c101'::uuid, store, gen_random_uuid(), buyer, 'Cliente Teste', 'pending', 50, 'retirada', true from t;
update orders set store_visible_at = now() - interval '4 minutes' where id = '00000000-0000-0000-0000-00000000c101';
select public.process_delivery_cycle();
do $$ begin
  assert exists (select 1 from profile_notifications where kind = 'order_waiting_store' and ref_id = '00000000-0000-0000-0000-00000000c101'), '1a: loja avisada';
  assert (select status from orders where id = '00000000-0000-0000-0000-00000000c101') = 'pending', '1b: ainda pendente';
end $$;
update orders set store_visible_at = now() - interval '11 minutes' where id = '00000000-0000-0000-0000-00000000c101';
select public.process_delivery_cycle();
do $$ begin
  assert (select status || '/' || closed_reason from orders where id = '00000000-0000-0000-0000-00000000c101') = 'rejected/store_timeout', '1c: cancelado por falta de resposta';
  assert (select count(*) from profile_notifications where kind = 'order_store_timeout' and ref_id = '00000000-0000-0000-0000-00000000c101') = 2, '1d: cliente e loja avisados';
  assert not exists (select 1 from profile_notifications where kind = 'order_rejected' and ref_id = '00000000-0000-0000-0000-00000000c101'), '1e: sem o aviso de "recusado"';
end $$;

-- 2) o cliente cancela enquanto a loja não aceitou; depois de aceito, não
insert into orders (id, store_id, checkout_id, buyer_id, buyer_name, status, total_amount, delivery_option, store_visible)
select '00000000-0000-0000-0000-00000000c201'::uuid, store, gen_random_uuid(), buyer, 'Cliente Teste', 'pending', 50, 'retirada', true from t union all
select '00000000-0000-0000-0000-00000000c202'::uuid, store, gen_random_uuid(), buyer, 'Cliente Teste', 'preparing', 50, 'retirada', true from t;
select pg_temp.as_((select buyer from t)); set local role authenticated;
select public.cancel_held_order('00000000-0000-0000-0000-00000000c201');
do $$ begin
  begin perform public.cancel_held_order('00000000-0000-0000-0000-00000000c202'); raise exception 'deveria recusar';
  exception when others then if sqlerrm = 'deveria recusar' then raise; end if; end;
end $$;
reset role;
select pg_temp.as_((select stranger from t)); set local role authenticated;
do $$ begin
  begin perform public.cancel_held_order('00000000-0000-0000-0000-00000000c202'); raise exception 'estranho cancelou';
  exception when others then if sqlerrm = 'estranho cancelou' then raise; end if; end;
end $$;
reset role;
do $$ begin
  assert (select status || '/' || closed_reason from orders where id = '00000000-0000-0000-0000-00000000c201') = 'rejected/customer_cancelled', '2a: cancelado pelo cliente';
  assert exists (select 1 from profile_notifications where kind = 'order_customer_cancelled' and ref_id = '00000000-0000-0000-0000-00000000c201'), '2b: loja avisada';
  assert (select status from orders where id = '00000000-0000-0000-0000-00000000c202') = 'preparing', '2c: aceito não cancela';
end $$;

-- 3) loja fechada não recebe pedido de ENTREGA (retirada continua)
update stores set business_hours = '{"weekly":{"0":{"isOpen":false},"1":{"isOpen":false},"2":{"isOpen":true,"start":"03:00","end":"03:01"},"3":{"isOpen":false},"4":{"isOpen":false},"5":{"isOpen":false},"6":{"isOpen":false}}}'::jsonb where id = (select store from t);
do $$ begin
  begin
    insert into orders (store_id, checkout_id, buyer_id, status, total_amount, delivery_option) select store, gen_random_uuid(), buyer, 'pending', 10, 'entrega' from t;
    raise exception 'loja fechada aceitou';
  exception when others then if sqlerrm = 'loja fechada aceitou' then raise; end if; assert sqlerrm like 'A loja está fechada%', '3a: ' || sqlerrm; end;
  insert into orders (store_id, checkout_id, buyer_id, status, total_amount, delivery_option) select store, gen_random_uuid(), buyer, 'pending', 10, 'retirada' from t;
end $$;
do $$ begin
  assert public._store_open_now('{"weekly":{"0":{"isOpen":true,"start":"00:00","end":"00:00"},"1":{"isOpen":true,"start":"00:00","end":"00:00"},"2":{"isOpen":true,"start":"00:00","end":"00:00"},"3":{"isOpen":true,"start":"00:00","end":"00:00"},"4":{"isOpen":true,"start":"00:00","end":"00:00"},"5":{"isOpen":true,"start":"00:00","end":"00:00"},"6":{"isOpen":true,"start":"00:00","end":"00:00"}}}'), '3b: 24 h aberta';
  assert not public._store_open_now(null), '3c: sem horário = fechada';
  assert public._store_open_now('{"weekly":{"5":{"isOpen":true,"start":"11:00","end":"23:00","lunchStart":"14:00","lunchEnd":"15:00"}}}', '2026-11-13 18:30:00+00') = false, '3d: sexta 14h30 em Porto Velho (18:30 UTC) = hora do almoço, fechada';
  assert public._store_open_now('{"weekly":{"5":{"isOpen":true,"start":"11:00","end":"23:00","lunchStart":"14:00","lunchEnd":"15:00"}}}', '2026-11-13 20:00:00+00') = true, '3e: sexta 16h = aberta';
end $$;

-- 4) código de retirada: equipe da loja vê; estranho não
update stores set business_hours = '{"weekly":{"0":{"isOpen":true,"start":"00:00","end":"00:00"},"1":{"isOpen":true,"start":"00:00","end":"00:00"},"2":{"isOpen":true,"start":"00:00","end":"00:00"},"3":{"isOpen":true,"start":"00:00","end":"00:00"},"4":{"isOpen":true,"start":"00:00","end":"00:00"},"5":{"isOpen":true,"start":"00:00","end":"00:00"},"6":{"isOpen":true,"start":"00:00","end":"00:00"}}}'::jsonb where id = (select store from t);
insert into employees (store_id, name, user_id, is_active) select store, 'Balconista', buyer, true from t;
select pg_temp.as_((select buyer from t)); set local role authenticated;
select count(*) from public.get_store_pickup_codes((select store from t));
select count(*) from public.get_my_staff_pickup_codes();
reset role;
select pg_temp.as_((select stranger from t)); set local role authenticated;
do $$ begin
  begin perform public.get_store_pickup_codes((select store from t)); raise exception 'estranho viu'; exception when others then if sqlerrm = 'estranho viu' then raise; end if; end;
end $$;
reset role;

-- 5) entregador parado: passado adiante e contado; 6) três desistências pausam as entregas dele
create temp table idle as
select x.id as ride, x.driver_id as drv, x.order_id as ord from ride_requests x join order_delivery_dispatches d on d.ride_request_id = x.id and d.flow_version = 1
  join orders o on o.id = x.order_id and o.status in ('pending','preparing','ready')
 where x.status = 'accepted' and x.driver_departed_at is null and x.driver_arrived_at is null and x.ride_started_at is null limit 1;
do $$ begin assert (select count(*) from idle) = 1, '5: precisa de uma entrega aceita parada (massa local)'; end $$;
update orders set created_at = now() - interval '1 hour' where id = (select ord from idle);
update ride_applications set created_at = now() - interval '20 minutes' where ride_request_id = (select ride from idle) and applicant_id = (select drv from idle) and status = 'accepted';
select public.process_delivery_cycle();
do $$ begin
  assert (select status from ride_requests where id = (select ride from idle)) = 'pending', '5a: entrega voltou a procurar';
  assert exists (select 1 from delivery_cycle_events where kind = 'driver_idle_released' and ride_id = (select ride from idle)), '5b: contado como demora';
  assert not exists (select 1 from delivery_cycle_events where kind = 'driver_quit' and ride_id = (select ride from idle)), '5c: não conta duas vezes';
  assert exists (select 1 from profile_notifications where kind = 'delivery_driver_idle' and profile_id = (select drv from idle)), '5d: entregador avisado';
end $$;
insert into delivery_cycle_events (kind, driver_id, dedupe) select 'driver_quit', drv, 'teste:' || g from idle, generate_series(1, 2) g;
select public._cycle_driver_strike((select drv from idle), 'driver_quit', gen_random_uuid(), null);
do $$ begin
  assert exists (select 1 from driver_cycle_blocks where driver_id = (select drv from idle) and until > now()), '6a: pausado';
  assert exists (select 1 from profile_notifications where kind = 'delivery_quit_blocked' and profile_id = (select drv from idle)), '6b: avisado';
end $$;
select pg_temp.as_((select drv from idle)); set local role authenticated;
do $$ begin
  begin
    insert into ride_applications (ride_request_id, applicant_id, proposed_price) values ((select ride from idle), (select drv from idle), 5);
    raise exception 'pausado aceitou';
  exception when others then if sqlerrm = 'pausado aceitou' then raise; end if; end;
end $$;
reset role;

-- 7) a loja recusa pedido que já tinha entregador: conta; no limite, aviso
create temp table rej as
select o.id as ord, o.store_id as store from orders o join ride_requests x on x.order_id = o.id and x.driver_id is not null
 where o.status in ('pending','preparing') and o.id <> (select ord from idle) limit 1;
insert into delivery_cycle_events (kind, store_id, dedupe) select 'store_rejected_after_driver', store, 'teste-rej:' || g from rej, generate_series(1, 2) g;
update orders set status = 'rejected' where id = (select ord from rej);
do $$ begin
  assert exists (select 1 from delivery_cycle_events where kind = 'store_rejected_after_driver' and order_id = (select ord from rej)), '7a: contado';
  assert exists (select 1 from profile_notifications where kind = 'store_reject_warning' and ref_id = (select ord from rej)), '7b: loja avisada no limite';
end $$;

-- 8) a caminho há tempo demais: cliente e loja avisados
create temp table late as
select x.id as ride, x.order_id as ord from ride_requests x join orders o on o.id = x.order_id and o.status in ('preparing','ready')
 where x.status = 'accepted' and x.ride_started_at is not null limit 1;
do $$ begin assert (select count(*) from late) = 1, '8: precisa de uma entrega a caminho (massa local)'; end $$;
update orders set created_at = now() - interval '2 hours' where id = (select ord from late);
update ride_requests set ride_started_at = now() - interval '90 minutes' where id = (select ride from late);
select public.process_delivery_cycle();
do $$ begin
  assert exists (select 1 from delivery_cycle_events where kind = 'transit_late' and ride_id = (select ride from late)), '8a: registrado';
  assert (select count(*) from profile_notifications where kind = 'delivery_late' and ref_id = (select ord from late)) = 2, '8b: cliente e loja avisados';
end $$;
select 'delivery_cycle: 8 grupos OK';
rollback;
