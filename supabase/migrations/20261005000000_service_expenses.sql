-- Custos fixos de serviços externos pagos (Supabase, Asaas, Mapbox, Firebase,
-- hospedagem, domínio etc) — alimenta a aba "Financeiro" do admin, pra saber
-- quanto o iUser gasta por mês e não deixar nenhuma conta vencer sem
-- perceber. Só a service role lê/escreve (rotas /api/admin/*), sem policy
-- de SELECT/INSERT pra ninguém mais — é dado financeiro sensível.
create table if not exists public.service_expenses (
    id uuid primary key default gen_random_uuid(),
    service_name text not null,
    category text,
    plan_name text,
    monthly_cost numeric(10,2) not null default 0,
    billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly', 'usage', 'one_time')),
    currency text not null default 'BRL',
    next_due_date date,
    billing_url text,
    notes text,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.service_expenses enable row level security;

create index if not exists service_expenses_is_active_idx on public.service_expenses(is_active);
create index if not exists service_expenses_next_due_date_idx on public.service_expenses(next_due_date);

-- Semente: os serviços pagos que já sabemos que o iUser usa de verdade
-- (confirmado em package.json / integrações no código). Custo fica 0 até o
-- admin preencher o valor real na aba Financeiro.
insert into public.service_expenses (service_name, category, monthly_cost, billing_cycle, notes)
values
    ('Supabase', 'Banco de dados / Backend', 0, 'monthly', 'Banco de dados, autenticação e storage — supabase/config.toml'),
    ('Asaas', 'Pagamentos', 0, 'usage', 'Cobrança de assinaturas e saques via PIX — taxa por transação'),
    ('Mapbox', 'Mapas', 0, 'usage', 'mapbox-gl no package.json'),
    ('Firebase', 'Notificações push (mobile)', 0, 'monthly', 'firebase-admin no package.json — push pro app mobile via Capacitor')
on conflict do nothing;
