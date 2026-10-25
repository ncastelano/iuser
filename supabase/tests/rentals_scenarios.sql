-- Cenários do aluguel de imóveis (migration 20261126), numa transação desfeita:
--   psql ... -f supabase/tests/rentals_scenarios.sql   (banco LOCAL ou staging)
begin;
do $$
declare
    host uuid; guest uuid; stranger uuid; l uuid; appt uuid; v jsonb; n int; has_plan boolean;
begin
    -- um anunciante COM plano ativo (pós-pago), um visitante e um estranho
    select s.user_id into host from subscriptions s join plans p on p.id = s.plan_id where p.code = 'pos_pago' and s.status = 'active' and s.current_period_end > now() limit 1;
    assert host is not null, 'sem anunciante pós-pago de teste';
    select id into guest from profiles where id <> host order by random() limit 1;
    select id into stranger from profiles where id not in (host, guest) order by random() limit 1;
    delete from driver_postpaid_charges where driver_id = host and type <> 'payment';   -- dívida zerada só nesta transação

    -- ===== o anunciante publica: grava, cobra a taxa do pós-pago =====
    perform set_config('request.jwt.claims', json_build_object('sub', host, 'role', 'authenticated')::text, true);
    set local role authenticated;
    insert into rental_listings (slug, owner_id, title, property_type, rental_kind, price_period, price, condo_fee, neighborhood, city, approx_lat, approx_lng, bedrooms)
    values ('teste-apto-centro', host, 'Apartamento 2 quartos no Centro', 'apartamento', 'mensal', 'mes', 1800, 250, 'Centro', 'Porto Velho', -8.76, -63.9, 2) returning id into l;
    insert into rental_listing_private (listing_id, address, number, complement) values (l, 'Rua Dom Pedro II', '123', 'Apto 31');
    reset role;
    assert (select count(*) from driver_postpaid_charges where rental_listing_id = l and type = 'rental_listing_fee') = 1, 'taxa do pós-pago não foi cobrada';

    -- período tem que combinar com o tipo (mensal = mês, temporada = dia)
    perform set_config('request.jwt.claims', json_build_object('sub', host, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin insert into rental_listings (slug, owner_id, title, property_type, rental_kind, price_period, price, neighborhood, city) values ('x-errado', host, 'Casa errada', 'casa', 'mensal', 'dia', 10, 'Centro', 'Porto Velho'); assert false, 'aceitou período errado';
    exception when check_violation then null; end;

    -- ===== o público vê o anúncio, mas NUNCA o endereço =====
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', stranger, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert (select count(*) from rental_listings where id = l) = 1, 'estranho não vê o anúncio ativo';
    assert (select count(*) from rental_listing_private where listing_id = l) = 0, 'estranho leu o endereço direto';
    assert get_rental_address(l) is null, 'estranho recebeu o endereço';
    begin update rental_listings set price = 1 where id = l; if found then raise exception 'estranho editou o anúncio'; end if; end;
    assert (select price from rental_listings where id = l) = 1800, 'preço foi alterado por estranho';

    -- ===== visita: só com o anunciante, e o endereço só depois de confirmada =====
    begin insert into appointments (customer_id, customer_slug, customer_avatar_url, owner_id, owner_slug, provider_profile_id, date, time, duration_minutes, service_name, service_type, people_count, status, direction, is_public, rental_listing_id)
        values (stranger, 's', '', stranger, 's', stranger, current_date + 701, '03:00', 30, 'Visita errada', 'service', 1, 'pending', 'outgoing', false, l);
        assert false, 'aceitou visita com quem não anuncia';
    exception when others then assert sqlerrm like '%mesmo%' or sqlerrm like '%anuncia%' or sqlerrm like '%agendamentos%', 'erro inesperado: ' || sqlerrm; end;

    reset role;
    insert into appointments (customer_id, customer_slug, customer_avatar_url, owner_id, owner_slug, provider_profile_id, date, time, duration_minutes, service_name, service_type, people_count, status, direction, is_public, rental_listing_id)
    values (guest, 'g', '', host, 'h', host, current_date + 700, '03:00', 30, 'Visita: Apartamento', 'service', 1, 'pending', 'outgoing', false, l) returning id into appt;
    perform set_config('request.jwt.claims', json_build_object('sub', guest, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert get_rental_address(l) is null, 'endereço liberado com visita só pendente';
    reset role;
    update appointments set status = 'confirmed' where id = appt;
    perform set_config('request.jwt.claims', json_build_object('sub', guest, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v := get_rental_address(l);
    assert v->>'address' = 'Rua Dom Pedro II' and v->>'number' = '123', 'endereço não liberado após visita confirmada';

    -- ===== o dono lê o endereço; o selo de confiança vem do histórico =====
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', host, 'role', 'authenticated')::text, true);
    set local role authenticated;
    assert get_rental_address(l)->>'address' = 'Rua Dom Pedro II', 'dono não leu o endereço';
    reset role;
    v := get_rental_host_trust(host);
    assert (v->>'badge') is null and (v->>'agency')::boolean = false, 'selo indevido no primeiro anúncio: ' || v::text;
    update rental_listings set status = 'rented' where id = l;
    assert (get_rental_host_trust(host)->>'rented_count')::int = 1, 'imóvel alugado não contou';
    raise notice 'rentals: todos os cenários passaram';
end $$;
rollback;
