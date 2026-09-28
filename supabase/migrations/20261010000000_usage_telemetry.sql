-- Contagem própria de Egress e Realtime Messages — o Supabase não expõe
-- esses números por API pública (ver commit b1b81d8), então rastreamos
-- do nosso lado: o cliente Supabase compartilhado (src/lib/supabase/
-- client.ts) mede o tamanho de cada resposta e conta cada mensagem de
-- Realtime recebida, acumula no navegador e manda pra cá de tempos em
-- tempos (mesmo esquema do site_visits/PageViewTracker). Não bate 100%
-- com o número exato do Supabase (eles contam overhead de protocolo que
-- a gente não vê), mas mede o essencial: a tendência de crescimento.
create table if not exists public.usage_telemetry_daily (
    day date primary key default current_date,
    egress_bytes bigint not null default 0,
    realtime_messages bigint not null default 0,
    updated_at timestamptz not null default now()
);

alter table public.usage_telemetry_daily enable row level security;

-- SECURITY DEFINER pra permitir incremento seguro sem dar UPDATE aberto:
-- anon/authenticated só conseguem somar (via essa função), nunca ler ou
-- sobrescrever a tabela direto.
create or replace function public.track_usage(p_egress_bytes bigint default 0, p_realtime_messages bigint default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.usage_telemetry_daily (day, egress_bytes, realtime_messages)
    values (current_date, greatest(p_egress_bytes, 0), greatest(p_realtime_messages, 0))
    on conflict (day) do update set
        egress_bytes = usage_telemetry_daily.egress_bytes + excluded.egress_bytes,
        realtime_messages = usage_telemetry_daily.realtime_messages + excluded.realtime_messages,
        updated_at = now();
end;
$$;

revoke all on function public.track_usage(bigint, bigint) from public;
grant execute on function public.track_usage(bigint, bigint) to anon, authenticated;
