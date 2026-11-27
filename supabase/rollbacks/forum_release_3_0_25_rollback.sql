-- Rollback da 20261130000130: tira a novidade 3.0.25 do Fórum.
DELETE FROM public.forum_releases WHERE version = '3.0.25';
