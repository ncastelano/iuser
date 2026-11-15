-- Desfaz 20261130000013_moderation: volta as leituras ao que eram (tudo visível) e remove denúncias e ocultações. Publicações ocultadas por denúncia ficam INATIVAS — reative-as antes (admin_moderate 'restore') se quiser.
-- (conteúdo ocultado volta a aparecer; as denúncias e decisões já gravadas são APAGADAS)
UPDATE public.products SET is_active = true WHERE id IN (SELECT target_id FROM public.content_moderation WHERE target_type = 'publication' AND status = 'hidden' AND restore_active);
DROP POLICY IF EXISTS flashes_read ON public.flashes;
CREATE POLICY flashes_read ON public.flashes FOR SELECT USING (true);
DROP POLICY IF EXISTS flash_comments_read ON public.flash_comments;
CREATE POLICY flash_comments_read ON public.flash_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public reviews are viewable by everyone" ON public.product_reviews;
CREATE POLICY "Public reviews are viewable by everyone" ON public.product_reviews FOR SELECT USING (true);
DROP POLICY IF EXISTS comments_select_policy ON public.comments;
CREATE POLICY comments_select_policy ON public.comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Ler mensagens (senha exige ser membro)" ON public.community_messages;
CREATE POLICY "Ler mensagens (senha exige ser membro)" ON public.community_messages FOR SELECT USING (
    (NOT (EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_messages.community_id AND c.requires_password))) OR public._community_is_member(community_id, auth.uid()));
CREATE OR REPLACE FUNCTION public.get_flash_feed(p_mode text DEFAULT 'all'::text, p_limit integer DEFAULT 20, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_kind text DEFAULT NULL::text)
 RETURNS TABLE(kind text, id uuid, created_at timestamp with time zone, author_id uuid, author_name text, author_slug text, author_avatar text, title text, content text, media_url text, media_type text, like_count integer, comment_count integer, share_count integer, liked boolean, following boolean, link text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    -- DEFINER: confere is_active/is_blocked do autor (colunas privadas de profiles) mas só DEVOLVE o que é público (nome, @, foto)
    WITH items AS (
        SELECT 'flash'::text AS kind, f.id, f.created_at, f.author_id, NULL::text AS title, f.content, f.media_url, f.media_type,
               f.like_count, f.comment_count, f.share_count,
               EXISTS (SELECT 1 FROM public.flash_likes l WHERE l.flash_id = f.id AND l.profile_id = (SELECT auth.uid())) AS liked,
               NULL::text AS link
          FROM public.flashes f
        UNION ALL
        SELECT 'publication', pr.id, pr.created_at, pr.owner_id, pr.name, pr.description, pr.image_url,
               CASE WHEN pr.image_url IS NOT NULL THEN 'image' END,
               (SELECT count(*)::int FROM public.likes l WHERE l.publication_id = pr.id),
               (SELECT count(*)::int FROM public.comments c WHERE c.publication_id = pr.id), 0,
               EXISTS (SELECT 1 FROM public.likes l WHERE l.publication_id = pr.id AND l.profile_id = (SELECT auth.uid())),
               pr.slug
          FROM public.products pr
         WHERE pr.listing_type = 'publication' AND pr.is_active AND pr.store_id IS NULL
    )
    SELECT i.kind, i.id, i.created_at, i.author_id, p.name, p."profileSlug", p.avatar_url, i.title, i.content, i.media_url, i.media_type,
           i.like_count, i.comment_count, i.share_count, i.liked,
           EXISTS (SELECT 1 FROM public.follows fo WHERE fo.follower_id = (SELECT auth.uid()) AND fo.following_id = i.author_id) AS following,
           i.link
      FROM items i
      JOIN public.profiles p ON p.id = i.author_id
     WHERE COALESCE(p.is_active, true) AND NOT COALESCE(p.is_blocked, false)
       AND (p_before IS NULL OR i.created_at < p_before)
       AND (p_kind IS NULL OR i.kind = p_kind)   -- 'flash' | 'publication' | todos
       AND (p_mode <> 'following'
            OR i.author_id = (SELECT auth.uid())
            OR EXISTS (SELECT 1 FROM public.follows fo WHERE fo.follower_id = (SELECT auth.uid()) AND fo.following_id = i.author_id))
     ORDER BY i.created_at DESC
     LIMIT LEAST(GREATEST(p_limit, 1), 50);
$function$;
CREATE OR REPLACE FUNCTION public.trg_ping_live_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.kind = ANY (ARRAY[
        'delivery_driver_assigned', 'delivery_picked_up', 'delivery_at_door', 'delivery_message', 'delivery_issue',
        'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_driver_cancelled', 'delivery_cancelled',
        'delivery_order_ready', 'delivery_completed',
        'favorite_invite', 'favorite_accepted', 'favorite_declined',
        'dues_update', 'dispute_update'
    ]) THEN
        PERFORM public._ping_delivery_events();
    END IF;
    RETURN NEW;
END; $$;
DELETE FROM public.profile_notifications WHERE kind = 'moderation_update';
ALTER TABLE public.profile_notifications DROP CONSTRAINT IF EXISTS profile_notifications_kind_check;
ALTER TABLE public.profile_notifications ADD CONSTRAINT profile_notifications_kind_check CHECK (kind = ANY (ARRAY[
    'follow', 'profile_view', 'link_visit', 'publication_like', 'service_like', 'product_like',
    'publication_comment', 'profile_comment', 'comment_reply', 'comment_like', 'invite_signup', 'service_application',
    'service_selected', 'service_completed', 'service_review', 'ride_application', 'ride_selected', 'ride_review',
    'customer_review', 'appointment_new', 'appointment_confirmed', 'appointment_cancelled', 'appointment_changed', 'group_invite',
    'order_new', 'order_accepted', 'order_ready', 'order_rejected', 'order_delivered', 'delivery_driver_assigned',
    'delivery_driver_accepted', 'delivery_driver_arrived', 'delivery_picked_up', 'delivery_order_ready', 'delivery_completed', 'delivery_done',
    'delivery_driver_cancelled', 'delivery_cancelled', 'delivery_at_door', 'delivery_message', 'delivery_issue',
    'favorite_invite', 'favorite_accepted', 'favorite_declined',
    'dues_update', 'dispute_update'
]));
DROP FUNCTION IF EXISTS public.admin_moderate(text, uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.report_content(text, uuid, text, text);
DROP FUNCTION IF EXISTS public._moderation_apply(text, uuid, boolean);
DROP FUNCTION IF EXISTS public._content_label(text);
DROP FUNCTION IF EXISTS public._content_author(text, uuid);
DROP FUNCTION IF EXISTS public._is_hidden(text, uuid);
DROP TABLE IF EXISTS public.content_moderation;
DROP TABLE IF EXISTS public.content_reports;
