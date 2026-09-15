-- supabase/migrations/20260919090000_driver_selfie_photo.sql
--
-- Foto do motorista (rosto), separada da foto do carro - pro passageiro
-- reconhecer quem vai dirigir, não só o carro. Mesmo padrão exato do
-- bucket driver-car-photos (ver 20260907050000_driver_vehicles.sql).

alter table public.driver_vehicles
    add column if not exists driver_photo_url text;

insert into storage.buckets (id, name, public)
values ('driver-selfie-photos', 'driver-selfie-photos', true)
on conflict (id) do nothing;

create policy "Driver Selfie Photos Public Read" on storage.objects for select
    using (bucket_id = 'driver-selfie-photos');
create policy "Driver Selfie Photos Authenticated Upload" on storage.objects for insert
    to authenticated with check (bucket_id = 'driver-selfie-photos');
create policy "Driver Selfie Photos Owner Update" on storage.objects for update
    to authenticated using (bucket_id = 'driver-selfie-photos' and (auth.uid())::text = (storage.foldername(name))[1]);
create policy "Driver Selfie Photos Owner Delete" on storage.objects for delete
    to authenticated using (bucket_id = 'driver-selfie-photos' and (auth.uid())::text = (storage.foldername(name))[1]);
