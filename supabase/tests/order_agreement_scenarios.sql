-- Cenários do "pedido combinado" (migration 092), só LOCAL, transação desfeita:
--   docker exec -i -e PGPASSWORD=postgres supabase_db_iuser-local psql -h 127.0.0.1 -U supabase_admin -d postgres < supabase/tests/order_agreement_scenarios.sql
-- Precisa de um pedido Pix pendente da espetaria (seed-espetaria.mjs + um pedido do simulador).
begin;
create temp table t as select o.id, o.buyer_id, s.owner_id, o.total_amount from orders o join stores s on s.id = o.store_id join order_payments p on p.order_id = o.id
  where s."storeSlug" = 'espetaria-brasa-viva' and o.status = 'pending' and p.method = 'pix' and (select count(*) from order_items i where i.order_id = o.id) >= 2 order by o.created_at desc limit 1;
grant select on t to authenticated;
select 'pedido', id, total_amount from t;
-- 1) cliente: o Pix não aparece antes do aceite
select set_config('request.jwt.claims', json_build_object('sub', (select buyer_id from t), 'role', 'authenticated')::text, true);
set local role authenticated;
select '1 pix escondido (esperado t)', (get_order_payment((select id from t))->>'pix_key') is null;
-- 2) cliente tira um item: o total cai
select '2 ajuste', customer_adjust_order((select id from t), jsonb_build_array(jsonb_build_object('id', (select i.id from order_items i where i.order_id = (select id from t) order by total_price limit 1), 'quantity', 0)));
select '2 de acordo', customer_agree_order((select id from t));
reset role;
-- 3) loja responde com mensagem
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from t), 'role', 'authenticated')::text, true);
set local role authenticated;
select '3 resposta', store_reply_order((select id from t), 'Acabou a farofa, tudo bem sem ela?') ? 'conversation_id';
-- 4) loja aceita e tenta marcar pronto SEM o Pix confirmado: recusa
update orders set status = 'preparing' where id = (select id from t);
do $$ begin update orders set status = 'ready' where id = (select id from t); raise notice '4 ERRADO: deixou'; exception when others then raise notice '4 recusou ok: %', sqlerrm; end $$;
reset role;
-- 5) depois do aceite o Pix aparece para o cliente
select set_config('request.jwt.claims', json_build_object('sub', (select buyer_id from t), 'role', 'authenticated')::text, true);
set local role authenticated;
select '5 pix visível (esperado t)', (get_order_payment((select id from t))->>'pix_key') is not null;
select '5 já paguei', report_order_paid((select id from t));
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from t), 'role', 'authenticated')::text, true);
set local role authenticated;
select '6 recebi', confirm_order_payment((select id from t), true);
update orders set status = 'ready' where id = (select id from t);
select '6 pronto depois do Pix (esperado ready)', status from orders where id = (select id from t);
rollback;
