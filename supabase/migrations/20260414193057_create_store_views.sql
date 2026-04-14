create table if not exists public.store_views (
    id uuid default gen_random_uuid() primary key,
    store_id uuid not null references public.stores(id) on delete cascade,
    viewer_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamp with time zone default now()
);

alter table public.store_views enable row level security;

create policy "Users can insert their own views" on public.store_views for insert with check (auth.uid() = viewer_id);
create policy "Store owners can read views" on public.store_views for select using (
    exists (
        select 1 from public.stores where stores.id = store_views.store_id and stores.owner_id = auth.uid()
    )
);

create index if not exists store_views_store_id_idx on public.store_views(store_id);
create index if not exists store_views_viewer_id_idx on public.store_views(viewer_id);
