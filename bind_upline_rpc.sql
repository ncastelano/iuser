-- Esta função permite que um usuário existente sem patrocinador (upline) se vincule a um!
-- Isso foi necessário porque se ele já tiver downlines, todos os filhos dele precisam ter 
-- o "path" atualizado para refletir a nova árvore inteira.

CREATE OR REPLACE FUNCTION bind_upline(p_user_id uuid, p_upline_id uuid) RETURNS void AS $$
DECLARE
    new_path ltree;
    old_path ltree;
    current_upline uuid;
BEGIN
    -- Verifica se já possui um upline
    SELECT upline_id, path INTO current_upline, old_path FROM public.profiles WHERE id = p_user_id;
    
    IF current_upline IS NOT NULL THEN
        RAISE EXCEPTION 'Este usuário já possui um upline e não pode ser realocado.';
    END IF;

    -- Constrói o novo path concatenando o path do upline com o ID do usuário alterado
    SELECT path || text2ltree(replace(p_user_id::text, '-', '_')) INTO new_path 
    FROM public.profiles 
    WHERE id = p_upline_id;

    -- 1. Atualiza o usuário alvo
    UPDATE public.profiles 
    SET upline_id = p_upline_id, path = new_path 
    WHERE id = p_user_id;

    -- 2. Atualiza CASCATA todos os filhos (downlines) que estavam vinculados a ele
    -- Ele pega a "raiz" antiga, arranca de todos onde path <@ raiz e troca pela "nova raiz"
    UPDATE public.profiles 
    SET path = new_path || subpath(path, nlevel(old_path)) 
    WHERE path <@ old_path AND id != p_user_id;
END;
$$ LANGUAGE plpgsql;
