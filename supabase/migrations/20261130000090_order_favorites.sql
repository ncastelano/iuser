-- 20261130000090_order_favorites.sql — PEDIDOS FAVORITOS (19/11/2026, decisão do dono) + novidade 3.0.3 no Fórum.
-- A pessoa marca um pedido como favorito (estrela) para repetir com um toque. Só a própria pessoa lê/grava as suas linhas,
-- e só de pedido que ELA fez (o banco confere). Repetir o pedido é feito no app (põe os itens no carrinho; o preço é o de hoje).
CREATE TABLE IF NOT EXISTS public.order_favorites (
    user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, order_id)
);
ALTER TABLE public.order_favorites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_favorites FROM anon;
GRANT SELECT, INSERT, DELETE ON public.order_favorites TO authenticated;
DROP POLICY IF EXISTS order_favorites_select ON public.order_favorites;
CREATE POLICY order_favorites_select ON public.order_favorites FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS order_favorites_insert ON public.order_favorites;
CREATE POLICY order_favorites_insert ON public.order_favorites FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.buyer_id = auth.uid()));
DROP POLICY IF EXISTS order_favorites_delete ON public.order_favorites;
CREATE POLICY order_favorites_delete ON public.order_favorites FOR DELETE TO authenticated USING (user_id = auth.uid());

INSERT INTO public.forum_releases (version, title, summary, added, improved, removed, released_at)
SELECT '3.0.3', 'Repetir pedido, favoritos e menos poluição',
       'Itens ficou mais compacto e agora dá para repetir um pedido inteiro e guardar os seus favoritos.',
       ARRAY['Botão "Repetir pedido" no Histórico: põe tudo de novo no carrinho, com o preço de hoje',
             'Pedidos favoritos (estrela) que aparecem no alto de Itens para pedir com um toque',
             'Conversas na barra do modo motorista',
             'Ganhos agora fica dentro da página de Entregas'],
       ARRAY['Itens com as abas Tudo, Histórico, Produtos, Serviços e Digitais, em fileiras que rolam para o lado',
             'O menu Eu fecha sozinho ao tocar em outro botão da barra',
             'Os números de avisos só aparecem nos modos que NÃO estão escolhidos no menu Eu',
             'Painel do perfil: o tipo do perfil foi para Informações do perfil e a Agenda ficou entre Visitantes e Notificações',
             'Fórum: abas Tutorial, Novidades e Sugerir ideia',
             'Logo das lojas redondo em Publicações das lojas'],
       ARRAY['Compras do perfil no painel (agora é o Histórico em Itens)', 'A aba Ganhos da barra do motorista'],
       now() + interval '2 seconds'
WHERE NOT EXISTS (SELECT 1 FROM public.forum_releases WHERE version = '3.0.3');
