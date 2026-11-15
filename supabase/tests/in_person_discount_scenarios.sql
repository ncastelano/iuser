-- Cenários da 20261130000062 (desconto manual no balcão). Só LOCAL, transação desfeita: docker exec -i supabase_db_iuser-local psql -U postgres < supabase/tests/in_person_discount_scenarios.sql
begin;
select set_config('request.jwt.claims', json_build_object('sub', s.owner_id, 'role','authenticated')::text, true) from stores s where "storeSlug"='pizzaria-forno-de-ouro';
set local role authenticated;
-- desconto normal
select (create_in_person_sale((select id from stores where "storeSlug"='pizzaria-forno-de-ouro'), jsonb_build_array(jsonb_build_object('product_id',(select id from products where store_id=(select id from stores where "storeSlug"='pizzaria-forno-de-ouro') and type='physical' and is_active and not is_combo order by price desc limit 1),'quantity',1)), 'teste', 'pix', null, 5))->>'total_amount' as total_com_5;
-- negativo recusa
do $$ begin perform create_in_person_sale((select id from stores where "storeSlug"='pizzaria-forno-de-ouro'), '[]'::jsonb, 'x','pix',null,-1); raise exception 'deveria recusar'; exception when others then if sqlerrm='deveria recusar' then raise; end if; raise notice 'ok negativo: %', sqlerrm; end $$;
-- maior que a venda recusa
do $$ begin perform create_in_person_sale((select id from stores where "storeSlug"='pizzaria-forno-de-ouro'), jsonb_build_array(jsonb_build_object('product_id',(select id from products where store_id=(select id from stores where "storeSlug"='pizzaria-forno-de-ouro') and type='physical' and is_active and not is_combo limit 1),'quantity',1)), 'x','pix',null,99999); raise exception 'deveria recusar'; exception when others then if sqlerrm='deveria recusar' then raise; end if; raise notice 'ok grande: %', sqlerrm; end $$;
-- 3 casas recusa
do $$ begin perform create_in_person_sale((select id from stores where "storeSlug"='pizzaria-forno-de-ouro'), '[]'::jsonb, 'x','pix',null,1.005); raise exception 'deveria recusar'; exception when others then if sqlerrm='deveria recusar' then raise; end if; raise notice 'ok casas: %', sqlerrm; end $$;
rollback;
