-- Cenários do comprovante (migration 091), só LOCAL, transação desfeita. Rode como superusuário:
--   docker exec -i -e PGPASSWORD=postgres supabase_db_iuser-local psql -h 127.0.0.1 -U supabase_admin -d postgres < supabase/tests/order_payment_receipt_scenarios.sql
-- Tira as 3 políticas antigas do banco LOCAL (a produção não as tem desde a 20261106) e confere quem lê o bucket payment-receipts:
-- quem enviou e a equipe da loja do pedido leem; um estranho não.
begin;
drop policy if exists "Allow public read" on storage.objects; drop policy if exists "Imagens de produtos são públicas" on storage.objects; drop policy if exists "Logos são públicas para leitura" on storage.objects;
create temp table t_obj as select o.name, p.store_id, split_part(o.name, '/', 1)::uuid as sender from storage.objects o join public.order_payments p on p.receipt_path = o.name where o.bucket_id = 'payment-receipts' limit 1;
grant select on t_obj to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where id not in (select sender from t_obj) and id not in (select owner_id from stores where id = (select store_id from t_obj)) limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select 'estranho (esperado 0)', count(*) from storage.objects where bucket_id = 'payment-receipts' and name = (select name from t_obj);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select owner_id from stores where id = (select store_id from t_obj)), 'role', 'authenticated')::text, true);
set local role authenticated;
select 'loja (esperado 1)', count(*) from storage.objects where bucket_id = 'payment-receipts' and name = (select name from t_obj);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select sender from t_obj), 'role', 'authenticated')::text, true);
set local role authenticated;
select 'cliente (esperado 1)', count(*) from storage.objects where bucket_id = 'payment-receipts' and name = (select name from t_obj);
rollback;
