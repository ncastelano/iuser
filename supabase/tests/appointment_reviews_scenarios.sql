-- Cenários do ciclo de avaliação dos serviços agendados (migration 20261124). Roda dentro de uma transação desfeita:
--   psql ... -f supabase/tests/appointment_reviews_scenarios.sql   (banco LOCAL ou staging)
begin;
do $$
declare
    cust uuid; own uuid; stranger uuid; a_done uuid; a_conf uuid; v jsonb; n int; ok boolean;
    function_err text;
begin
    -- um serviço de loja confirmado e um concluído DO MESMO dono (clientes diferentes do dono)
    select x.id, (select s.owner_id from stores s where s.id = x.store_id) into a_conf, own
      from appointments x where x.status = 'confirmed' and x.store_id is not null
        and x.customer_id <> (select s.owner_id from stores s where s.id = x.store_id)
        and exists (select 1 from appointments y join stores sy on sy.id = y.store_id where sy.owner_id = (select s.owner_id from stores s where s.id = x.store_id)
                    and y.status = 'completed' and y.customer_id <> sy.owner_id and not exists (select 1 from appointment_reviews r where r.appointment_id = y.id))
      limit 1;
    select y.id, y.customer_id into a_done, cust
      from appointments y join stores sy on sy.id = y.store_id
     where sy.owner_id = own and y.status = 'completed' and y.customer_id <> sy.owner_id and not exists (select 1 from appointment_reviews r where r.appointment_id = y.id) limit 1;
    select id into stranger from profiles where id not in (cust, own) and id not in (select customer_id from appointments where store_id is not null) limit 1;
    assert a_done is not null and a_conf is not null and stranger is not null, 'sem dados de teste';

    -- ===== como o CLIENTE =====
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert submit_appointment_review(a_done, 5, 'Atendimento ótimo') = true, 'cliente avalia o serviço';
    begin perform submit_appointment_review(a_done, 4, 'de novo'); assert false, 'avaliou duas vezes';
    exception when others then assert sqlerrm like '%já avaliou%', 'mensagem de duplicada: ' || sqlerrm; end;
    begin perform complete_appointment(a_conf); assert false, 'cliente finalizou o serviço';
    exception when others then assert sqlerrm like '%Só quem presta%', 'cliente não finaliza: ' || sqlerrm; end;
    v := get_appointment_review_state(a_done);
    assert v->>'role' = 'customer' and v->'my_review'->>'rating' = '5' and (v->'client_review') is null or (v->'client_review') = 'null'::jsonb, 'estado do cliente';
    assert (select count(*) from appointment_reviews where reviewer_id <> cust) = 0, 'cliente leu avaliação de outra pessoa';
    assert get_client_track_record(cust) is null, 'cliente não lê o próprio histórico de donos';

    -- ===== como o DONO =====
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', own, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v := get_appointment_review_state(a_done);
    assert v->'client_review'->>'rating' = '5', 'dono vê a avaliação do cliente sobre o serviço';
    assert submit_appointment_review(a_done, 3, 'Chegou atrasado') = true, 'dono avalia o cliente';
    assert complete_appointment(a_conf) = true, 'dono finaliza o serviço confirmado';
    v := get_client_track_record(cust);
    assert v is not null and jsonb_array_length(v->'by_owners') >= 1 and v->'by_owners'->0->>'comment' = 'Chegou atrasado', 'dono vê o histórico do cliente';
    assert jsonb_array_length(v->'own_comments') >= 1, 'dono vê o que o cliente disse dos serviços';

    -- ===== o CLIENTE nunca vê a avaliação do dono =====
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert (select count(*) from appointment_reviews where kind = 'client' and reviewee_id = cust) = 0, 'cliente enxergou a avaliação que o dono fez dele';
    v := get_appointment_review_state(a_done);
    assert v->'my_review'->>'comment' = 'Atendimento ótimo', 'cliente vê só a dele';

    -- ===== um ESTRANHO não vê nada =====
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert get_client_track_record(cust) is null, 'estranho leu histórico de cliente';
    assert get_appointment_review_state(a_done) is null, 'estranho leu o estado de avaliação';
    assert (select count(*) from appointment_reviews where reviewer_id <> stranger) = 0, 'estranho leu avaliações dos outros';
    begin perform submit_appointment_review(a_done, 5, 'invasor'); assert false, 'estranho avaliou';
    exception when others then assert sqlerrm like '%participa%', 'estranho: ' || sqlerrm; end;

    reset role;
    assert exists (select 1 from product_reviews pr join appointment_reviews r on r.service_id = pr.product_id and pr.profile_id = r.reviewer_id where r.appointment_id = a_done and r.kind = 'service'), 'avaliação do cliente foi para as avaliações do serviço (ou serviço sem vínculo)'
        or (select service_id from appointment_reviews where appointment_id = a_done and kind = 'service') is null;
    raise notice 'appointment_reviews: todos os cenários passaram';
end $$;
rollback;
