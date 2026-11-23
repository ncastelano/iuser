-- desfaz 20261130000104: volta get_people_places sem o centro
DROP FUNCTION IF EXISTS public.get_people_places(integer);
CREATE FUNCTION public.get_people_places(p_limit integer DEFAULT 8)
RETURNS TABLE(place text, people_count integer, avatars text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
    SELECT p.public_address, count(*)::int,
           (array_agg(p.avatar_url ORDER BY COALESCE(pp.total, 0) DESC) FILTER (WHERE p.avatar_url IS NOT NULL))[1:5]
      FROM public.profiles p
      LEFT JOIN public.profile_points pp ON pp.profile_id = p.id
     WHERE p.is_active AND NOT COALESCE(p.is_blocked, false)
       AND COALESCE(p.show_location, true) AND p.show_on_map
       AND p.public_address IS NOT NULL AND btrim(p.public_address) <> ''
     GROUP BY p.public_address
     ORDER BY count(*) DESC, p.public_address
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20);
$function$;
GRANT EXECUTE ON FUNCTION public.get_people_places(integer) TO anon, authenticated;
