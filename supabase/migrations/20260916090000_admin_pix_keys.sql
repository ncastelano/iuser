-- supabase/migrations/20260916090000_admin_pix_keys.sql
--
-- Chaves PIX cadastráveis pelo admin geral (ele pode ter mais de uma e
-- escolher qual é a padrão). A chave padrão continua espelhada em
-- store_access_settings.pix_key/pix_key_type/pix_receiver_name, que é o que
-- a tela de criar loja (StoreAccessGate) já lê - assim não precisou mexer em
-- nada do lado de quem paga.

create table public.admin_pix_keys (
    id uuid primary key default gen_random_uuid(),
    pix_key text not null,
    pix_key_type text not null check (pix_key_type in ('cpf', 'email', 'phone', 'random')),
    receiver_name text,
    is_default boolean not null default false,
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now()
);

alter table public.admin_pix_keys enable row level security;
-- Sem policy pro client: só as rotas /api/admin/pix-keys/* (supabaseAdmin)
-- enxergam essa tabela.

-- Chave padrão pedida pelo admin geral
insert into public.admin_pix_keys (pix_key, pix_key_type, is_default)
values ('69999693632', 'phone', true);

update public.store_access_settings
set pix_key = '69999693632', pix_key_type = 'phone', updated_at = now()
where id = 1;
