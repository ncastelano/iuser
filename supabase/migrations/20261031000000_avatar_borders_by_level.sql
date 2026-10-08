-- Bordas de avatar por graduação: cada nível (Bronze, Prata, Ouro, Diamante...) libera uma borda que a pessoa
-- resgata em Informações do Perfil → Bordas. Quem está num nível mais alto também resgata as dos níveis abaixo.
-- O nível considerado é o EFETIVO (o maior entre o conquistado e o concedido pelo admin) e nunca diminui.

ALTER TABLE public.avatar_borders
    ADD COLUMN IF NOT EXISTS required_level_id uuid REFERENCES public.network_levels(id) ON DELETE SET NULL;

-- Resgatar: agora também confere o nível mínimo da borda
CREATE OR REPLACE FUNCTION public.claim_avatar_border(p_slug text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_user uuid := auth.uid();
    v_b public.avatar_borders%ROWTYPE;
    v_req public.network_levels%ROWTYPE;
    v_my_order integer;
BEGIN
    IF v_user IS NULL THEN RAISE EXCEPTION 'Entre na sua conta pra resgatar'; END IF;
    SELECT * INTO v_b FROM public.avatar_borders WHERE slug = p_slug AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'Essa borda não está disponível'; END IF;
    IF v_b.grant_mode = 'admin_only' THEN RAISE EXCEPTION 'Essa borda só o administrador concede'; END IF;
    IF v_b.available_from IS NOT NULL AND now() < v_b.available_from THEN RAISE EXCEPTION 'Essa borda ainda não abriu pra resgate'; END IF;
    IF v_b.available_until IS NOT NULL AND now() > v_b.available_until THEN RAISE EXCEPTION 'O prazo pra resgatar essa borda acabou'; END IF;
    IF v_b.requires_prepaid AND NOT public._has_active_prepaid(v_user) THEN RAISE EXCEPTION 'Essa borda é pra quem usa o plano Pré-pago'; END IF;
    IF v_b.required_level_id IS NOT NULL THEN
        SELECT * INTO v_req FROM public.network_levels WHERE id = v_b.required_level_id;
        SELECT l.level_order INTO v_my_order FROM public.network_levels l WHERE l.id = public._effective_level_id(v_user);
        IF COALESCE(v_my_order, 0) < v_req.level_order THEN
            RAISE EXCEPTION 'Essa borda é pra quem chegou ao nível %', v_req.name;
        END IF;
    END IF;
    INSERT INTO public.user_avatar_borders (profile_id, border_id, source) VALUES (v_user, v_b.id, 'claim') ON CONFLICT DO NOTHING;
    RETURN v_b.id;
END; $$;
REVOKE ALL ON FUNCTION public.claim_avatar_border(text) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_avatar_border(text) TO authenticated;

-- Uma borda por nível (o admin edita cores, textos e o nível mínimo em Admin → Bordas)
INSERT INTO public.avatar_borders (slug, name, description, colors, grant_mode, required_level_id, sort_order)
SELECT v.slug, v.name, v.description, v.colors, 'claim', l.id, v.sort_order
FROM (VALUES
    ('nivel-bronze',   'Bronze',   'Pra quem chegou ao nível Bronze da graduação.',   ARRAY['#cd7f32','#e9a96b','#a05a1c','#e9a96b','#cd7f32'], 10, 'Bronze'),
    ('nivel-prata',    'Prata',    'Pra quem chegou ao nível Prata da graduação.',    ARRAY['#c0c0c0','#f1f5f9','#94a3b8','#f1f5f9','#c0c0c0'], 11, 'Prata'),
    ('nivel-ouro',     'Ouro',     'Pra quem chegou ao nível Ouro da graduação.',     ARRAY['#f5c518','#fff1a8','#d99a00','#fff1a8','#f5c518'], 12, 'Ouro'),
    ('nivel-diamante', 'Diamante', 'Pra quem chegou ao topo da graduação: Diamante.', ARRAY['#67e8f9','#a5b4fc','#f0abfc','#67e8f9'],            13, 'Diamante')
) AS v(slug, name, description, colors, sort_order, level_name)
JOIN public.network_levels l ON l.name = v.level_name
ON CONFLICT (slug) DO NOTHING;
