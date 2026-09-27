-- "Seguir" já era usado tanto pra perfis quanto pra lojas (Store.tsx grava
-- follows.following_id = store.id, e radar_metrics conta seguidores de loja
-- do mesmo jeito), mas a coluna só tinha FK pra profiles(id) — todo insert
-- de "seguir uma loja" violava a constraint e falhava silenciosamente
-- (o erro era capturado no código mas nunca mostrado nem desfazia o estado
-- otimista da UI). Por isso ninguém tinha loja nenhuma na lista de "seguindo".
--
-- Não dá pra apontar uma FK pra duas tabelas ao mesmo tempo, então troca a
-- validação de referência por um trigger: aceita following_id que exista em
-- profiles OU em stores.
ALTER TABLE public.follows DROP CONSTRAINT IF EXISTS follows_following_id_fkey;

CREATE OR REPLACE FUNCTION public.check_follows_following_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.following_id)
       AND NOT EXISTS (SELECT 1 FROM public.stores WHERE id = NEW.following_id) THEN
        RAISE EXCEPTION 'following_id % não corresponde a nenhum perfil ou loja', NEW.following_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS follows_following_id_check ON public.follows;
CREATE TRIGGER follows_following_id_check
    BEFORE INSERT OR UPDATE ON public.follows
    FOR EACH ROW EXECUTE FUNCTION public.check_follows_following_id();
