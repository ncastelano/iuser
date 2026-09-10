-- Instagram da loja (mesmo padrão do whatsapp: coluna própria, com fallback
-- pro instagram do perfil do dono quando a loja não tem o seu). Compartilhamentos
-- da loja, incrementados a cada clique em "Compartilhar" (badge no botão).
alter table stores
    add column if not exists instagram text,
    add column if not exists share_count integer not null default 0;

create or replace function increment_store_share_count(store_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
    update stores
    set share_count = share_count + 1
    where id = store_id
    returning share_count;
$$;
