-- Automatiza mais 2 métricas do painel Supabase sem precisar de nenhum
-- token novo — Storage e MAU também dão pra calcular direto do Postgres:
--   • storage.objects.metadata->>'size' soma o tamanho de tudo nos buckets
--   • auth.users.last_sign_in_at aproxima o MAU (login nos últimos 30 dias
--     — não é exatamente como o Supabase conta pra billing, mas é o mais
--     perto que dá sem a API de uso deles)
-- Egress, Realtime, Logs, MAU via SSO/terceiros e Transformações de
-- imagem continuam manuais: são medidos na borda da rede/gateway deles,
-- não existem nesse banco de jeito nenhum.
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
        ),
        'storage_size_bytes', (
            select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects
        ),
        'mau_last_30d', (
            select count(*) from auth.users where last_sign_in_at >= now() - interval '30 days'
        )
    );
$$;

revoke all on function public.get_database_stats() from public;
grant execute on function public.get_database_stats() to service_role;
