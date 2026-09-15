-- supabase/migrations/20260914214129_unaccent_search.sql
--
-- Busca (perfis, lojas, produtos) usava ILIKE puro, que nunca ignora
-- acentuação/cedilha no Postgres - por isso "agua" nunca encontrava
-- "água" (só achava lojas cuja storeSlug já vinha sem acento). A extensão
-- unaccent já está instalada (schema public) - expõe uma função de busca
-- por entidade que compara os dois lados (coluna e termo buscado) sem
-- acento.

create or replace function public.search_profiles_unaccented(search_term text)
returns setof profiles
language sql
stable
as $$
    select *
    from profiles
    where is_active = true
        and (
            public.unaccent(coalesce(name, '')) ilike public.unaccent('%' || search_term || '%')
            or public.unaccent(coalesce("profileSlug", '')) ilike public.unaccent('%' || search_term || '%')
            or public.unaccent(coalesce(description, '')) ilike public.unaccent('%' || search_term || '%')
            or public.unaccent(coalesce(bio, '')) ilike public.unaccent('%' || search_term || '%')
            or public.unaccent(coalesce(address, '')) ilike public.unaccent('%' || search_term || '%')
        )
    limit 20;
$$;

create or replace function public.search_stores_unaccented(search_term text)
returns setof stores
language sql
stable
as $$
    select *
    from stores
    where (
            public.unaccent(coalesce(name, '')) ilike public.unaccent('%' || search_term || '%')
            or public.unaccent(coalesce(description, '')) ilike public.unaccent('%' || search_term || '%')
            or public.unaccent(coalesce("storeSlug", '')) ilike public.unaccent('%' || search_term || '%')
            or public.unaccent(coalesce(category, '')) ilike public.unaccent('%' || search_term || '%')
        )
    limit 30;
$$;

create or replace function public.search_products_unaccented(search_term text)
returns setof products
language sql
stable
as $$
    select *
    from products
    where listing_type = 'sale'
        and public.unaccent(coalesce(name, '')) ilike public.unaccent('%' || search_term || '%')
    limit 50;
$$;

grant execute on function public.search_profiles_unaccented(text) to anon, authenticated;
grant execute on function public.search_stores_unaccented(text) to anon, authenticated;
grant execute on function public.search_products_unaccented(text) to anon, authenticated;
