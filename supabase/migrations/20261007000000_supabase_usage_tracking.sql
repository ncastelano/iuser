-- Painel "Supabase" dentro da aba Financeiro do admin: uma parte é
-- auto-coletada direto do Postgres (tamanho do banco, maiores tabelas) e
-- outra é preenchida à mão pelo admin olhando a página de uso/billing do
-- próprio Supabase (supabase.com/dashboard/project/<ref>/settings/billing) —
-- coisas como banda, storage e MAUs não dá pra ler via SQL, só pela API de
-- billing do Supabase, que o token do MCP (só leitura de Database) não
-- alcança.

-- ===== Auto: tamanho do banco + maiores tabelas =====
create or replace function public.get_database_stats()
returns json
language sql
security definer
set search_path = public
as $$
    select json_build_object(
        'database_size_bytes', pg_database_size(current_database()),
        'database_size_pretty', pg_size_pretty(pg_database_size(current_database())),
        'top_tables', (
            select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
                select
                    c.relname as table_name,
                    pg_total_relation_size(c.oid) as size_bytes,
                    pg_size_pretty(pg_total_relation_size(c.oid)) as size_pretty,
                    (select reltuples::bigint from pg_class where oid = c.oid) as approx_rows
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r'
                order by pg_total_relation_size(c.oid) desc
                limit 10
            ) t
        )
    );
$$;

revoke all on function public.get_database_stats() from public;
grant execute on function public.get_database_stats() to service_role;

-- ===== Manual: uso x cota de cada recurso do plano do Supabase =====
create table if not exists public.supabase_usage_metrics (
    id uuid primary key default gen_random_uuid(),
    metric_name text not null unique,
    used_value numeric not null default 0,
    included_value numeric not null default 0,
    unit text not null default '',
    notes text,
    updated_at timestamptz not null default now()
);

alter table public.supabase_usage_metrics enable row level security;

insert into public.supabase_usage_metrics (metric_name, used_value, included_value, unit)
values
    ('Banco de dados', 0, 0.5, 'GB'),
    ('Armazenamento (Storage)', 0, 1, 'GB'),
    ('Largura de banda (Egress)', 0, 5, 'GB'),
    ('Usuários ativos por mês (MAU)', 0, 50000, 'usuários'),
    ('Invocações de Edge Functions', 0, 500000, 'invocações'),
    ('Mensagens Realtime', 0, 2000000, 'mensagens')
on conflict (metric_name) do nothing;
