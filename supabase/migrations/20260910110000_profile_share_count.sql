-- Mesmo padrão de contagem de compartilhamentos criado pra loja
-- (20260910100000_store_instagram_and_share_count.sql), agora pro perfil
-- pessoal — profiles.instagram já existe desde antes.
alter table profiles
    add column if not exists share_count integer not null default 0;

create or replace function increment_profile_share_count(profile_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
    update profiles
    set share_count = share_count + 1
    where id = profile_id
    returning share_count;
$$;
