-- Complementa 20260921250000: o dono da loja precisa ler/criar campanhas e
-- ler o extrato de resgates direto do client (mesmo padrão já usado em
-- StorePublication.tsx pra inserir em products — sem rota de servidor pra
-- cada ação de dono de loja, só RLS conferindo posse).
CREATE POLICY "Dono da loja vê as campanhas dela" ON public.store_campaigns
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    );

CREATE POLICY "Dono da loja cria campanha" ON public.store_campaigns
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    );

CREATE POLICY "Dono da loja edita campanha (ex: desativar)" ON public.store_campaigns
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid())
    );

CREATE POLICY "Dono da loja vê os resgates das campanhas dela" ON public.store_campaign_redemptions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.store_campaigns c
            JOIN public.stores s ON s.id = c.store_id
            WHERE c.id = campaign_id AND s.owner_id = auth.uid()
        )
    );
