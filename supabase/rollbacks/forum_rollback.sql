-- Desfaz 20261130000087_forum.sql (apaga o fórum inteiro: novidades, ideias, votos e comentários)
DROP FUNCTION IF EXISTS public.admin_forum_hide_comment(uuid, boolean, uuid);
DROP FUNCTION IF EXISTS public.admin_forum_team_comment(uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.admin_forum_idea(uuid, text, text, uuid, boolean, uuid);
DROP FUNCTION IF EXISTS public.admin_forum_release(uuid, text, text, text, text[], text[], text[], uuid);
DROP FUNCTION IF EXISTS public.forum_delete_comment(uuid);
DROP FUNCTION IF EXISTS public.forum_comment(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.forum_vote(uuid, int);
DROP FUNCTION IF EXISTS public.forum_create_idea(text, text, text);
DROP TABLE IF EXISTS public.forum_comments;
DROP TABLE IF EXISTS public.forum_votes;
DROP TABLE IF EXISTS public.forum_ideas;
DROP TABLE IF EXISTS public.forum_releases;
