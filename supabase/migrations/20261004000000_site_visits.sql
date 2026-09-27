-- Registra toda troca de página no iUser (cadastrado ou não), pra dar pro
-- admin geral uma visão de tudo que acontece no site desde a home — não só
-- visitas a uma loja ou perfil específico (isso já existia em store_views/
-- profile_views). Sem policy de SELECT de propósito: só a service role
-- (rota /api/admin/*) lê isso, ninguém mais precisa ver quem visitou o quê.
create table if not exists public.site_visits (
    id uuid primary key default gen_random_uuid(),
    path text not null,
    user_id uuid references public.profiles(id) on delete set null,
    anonymous_id uuid not null,
    referrer text,
    created_at timestamptz not null default now()
);

alter table public.site_visits enable row level security;

create policy "Anyone can insert site visits" on public.site_visits for insert with check (true);

create index if not exists site_visits_created_at_idx on public.site_visits(created_at desc);
create index if not exists site_visits_user_id_idx on public.site_visits(user_id);
create index if not exists site_visits_anonymous_id_idx on public.site_visits(anonymous_id);
create index if not exists site_visits_path_idx on public.site_visits(path);
