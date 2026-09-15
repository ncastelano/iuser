-- supabase/migrations/20260915120000_store_access_paywall.sql
--
-- Paywall de criação de loja: taxa única (hoje R$1, valor/validade
-- configuráveis) liberada via PIX manual (confirmado pelo admin geral no
-- painel) ou por um código de liberação (dias ou vitalício), gerado pelo
-- admin geral ou por quem ele autorizar. A conta ncastelano@gmail.com
-- (administrador geral único) nunca passa por esse gate.

-- ========== store_access_settings (plano vigente, linha única) ==========
create table public.store_access_settings (
    id smallint primary key default 1,
    price_cents integer not null default 100,
    validity_days integer, -- null = vitalício
    pix_key text,
    pix_key_type text,
    pix_receiver_name text,
    updated_at timestamptz not null default now(),
    constraint store_access_settings_singleton check (id = 1)
);

insert into public.store_access_settings (id) values (1);

alter table public.store_access_settings enable row level security;

create policy "settings_select_authenticated"
    on public.store_access_settings for select
    to authenticated
    using (true);

-- ========== store_access_codes ==========
create table public.store_access_codes (
    id uuid primary key default gen_random_uuid(),
    code text not null unique,
    grant_type text not null check (grant_type in ('days', 'lifetime')),
    days integer,
    created_by uuid references public.profiles(id),
    active boolean not null default true,
    max_uses integer not null default 1,
    use_count integer not null default 0,
    created_at timestamptz not null default now(),
    constraint store_access_codes_days_check check (
        (grant_type = 'days' and days is not null and days > 0)
        or (grant_type = 'lifetime' and days is null)
    )
);

alter table public.store_access_codes enable row level security;
-- Sem policy de select/insert/update pro client: só as rotas /api/admin/*
-- (supabaseAdmin) e a função redeem_store_access_code (security definer)
-- tocam essa tabela.

-- ========== store_access_grants (o "crédito" de acesso) ==========
create table public.store_access_grants (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id),
    source text not null check (source in ('manual_pix', 'code')),
    source_code_id uuid references public.store_access_codes(id),
    grant_type text check (grant_type in ('days', 'lifetime')),
    days integer,
    amount_cents integer,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'consumed')),
    requested_at timestamptz not null default now(),
    reviewed_by uuid references public.profiles(id),
    reviewed_at timestamptz,
    store_id uuid references public.stores(id),
    consumed_at timestamptz
);

create index store_access_grants_profile_idx on public.store_access_grants(profile_id);
create index store_access_grants_status_idx on public.store_access_grants(status);

alter table public.store_access_grants enable row level security;

create policy "grants_select_own"
    on public.store_access_grants for select
    to authenticated
    using (profile_id = auth.uid());

-- Pedido de pagamento manual: só cria a própria linha, sempre pending e sem
-- os campos que só a aprovação (rota admin) preenche a partir do plano
-- vigente naquele momento — nunca confiando em valor mandado pelo client.
create policy "grants_insert_own_pending_pix"
    on public.store_access_grants for insert
    to authenticated
    with check (
        profile_id = auth.uid()
        and source = 'manual_pix'
        and status = 'pending'
        and grant_type is null
        and amount_cents is null
        and days is null
        and store_id is null
    );

-- update/delete: nenhuma policy pro client — só supabaseAdmin nas rotas
-- /api/admin/* (aprovar/rejeitar pagamento) e a função
-- create_store_with_access (consumir o grant ao criar a loja).

-- ========== profiles: permissão delegada de gerar código ==========
alter table public.profiles
    add column can_generate_store_codes boolean not null default false,
    add column store_codes_granted_by uuid references public.profiles(id),
    add column store_codes_granted_at timestamptz;

-- ========== stores: rastreio de como o acesso foi liberado ==========
alter table public.stores
    add column access_granted_at timestamptz,
    add column access_expires_at timestamptz, -- null = vitalício
    add column access_source text,
    add column access_grant_id uuid references public.store_access_grants(id);

-- A partir de agora, criar loja só pela função create_store_with_access
-- (security definer) — remove o insert direto que qualquer usuário logado
-- tinha (bastava mandar owner_id = auth.uid()), senão o gate de pagamento
-- vira só um degrau de UI, pulável via chamada direta ao Supabase.
drop policy if exists "owner_insere_loja" on public.stores;

-- ========== redeem_store_access_code ==========
create or replace function public.redeem_store_access_code(p_code text)
returns public.store_access_grants
language plpgsql
security definer
set search_path = public
as $$
declare
    v_code public.store_access_codes;
    v_grant public.store_access_grants;
begin
    if auth.uid() is null then
        raise exception 'Não autenticado';
    end if;

    select * into v_code
    from public.store_access_codes
    where code = p_code and active = true
    for update;

    if not found then
        raise exception 'Código inválido ou já usado';
    end if;

    if v_code.use_count >= v_code.max_uses then
        raise exception 'Código esgotado';
    end if;

    insert into public.store_access_grants (
        profile_id, source, source_code_id, grant_type, days,
        status, reviewed_at
    ) values (
        auth.uid(), 'code', v_code.id, v_code.grant_type, v_code.days,
        'approved', now()
    ) returning * into v_grant;

    update public.store_access_codes
        set use_count = use_count + 1,
            active = case when use_count + 1 >= max_uses then false else active end
        where id = v_code.id;

    return v_grant;
end;
$$;

revoke all on function public.redeem_store_access_code(text) from public;
grant execute on function public.redeem_store_access_code(text) to authenticated;

-- ========== create_store_with_access ==========
-- Único caminho pra inserir em public.stores. ncastelano@gmail.com (admin
-- geral) passa direto, sem grant. Qualquer outra conta precisa de um
-- store_access_grants aprovado e ainda não consumido (p_grant_id).
create or replace function public.create_store_with_access(p_grant_id uuid, p_store jsonb)
returns public.stores
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email text;
    v_grant public.store_access_grants;
    v_store public.stores;
    v_expires_at timestamptz;
    v_source text;
    v_consumed_grant_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Não autenticado';
    end if;

    select email into v_email from auth.users where id = auth.uid();

    if v_email = 'ncastelano@gmail.com' then
        v_expires_at := null;
        v_source := null;
        v_consumed_grant_id := null;
    else
        if p_grant_id is null then
            raise exception 'Acesso não liberado. Pague via PIX ou use um código.';
        end if;

        select * into v_grant
        from public.store_access_grants
        where id = p_grant_id
            and profile_id = auth.uid()
            and status = 'approved'
            and store_id is null
        for update;

        if not found then
            raise exception 'Acesso não liberado. Pague via PIX ou use um código.';
        end if;

        if v_grant.grant_type = 'days' then
            v_expires_at := now() + make_interval(days => v_grant.days);
        else
            v_expires_at := null;
        end if;
        v_source := v_grant.source;
        v_consumed_grant_id := p_grant_id;
    end if;

    insert into public.stores (
        name, "storeSlug", description, logo_url, owner_id,
        location, address, store_lat, store_lng,
        address_number, address_complement, category, whatsapp,
        access_granted_at, access_expires_at, access_source, access_grant_id
    ) values (
        p_store->>'name',
        p_store->>'storeSlug',
        p_store->>'description',
        p_store->>'logo_url',
        auth.uid(),
        case when p_store->>'store_lat' is not null and p_store->>'store_lng' is not null
            then ('POINT(' || (p_store->>'store_lng') || ' ' || (p_store->>'store_lat') || ')')::geography
            else null end,
        p_store->>'address',
        nullif(p_store->>'store_lat', '')::double precision,
        nullif(p_store->>'store_lng', '')::double precision,
        p_store->>'address_number',
        p_store->>'address_complement',
        p_store->>'category',
        p_store->>'whatsapp',
        now(), v_expires_at, v_source, v_consumed_grant_id
    ) returning * into v_store;

    if v_consumed_grant_id is not null then
        update public.store_access_grants
            set status = 'consumed', store_id = v_store.id, consumed_at = now()
            where id = v_consumed_grant_id;
    end if;

    return v_store;
end;
$$;

revoke all on function public.create_store_with_access(uuid, jsonb) from public;
grant execute on function public.create_store_with_access(uuid, jsonb) to authenticated;
