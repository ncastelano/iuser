-- O motorista pode excluir o próprio veículo (aba "Meu veículo" do painel do
-- motorista). A tabela só tinha política de SELECT/INSERT/UPDATE — sem esta,
-- o DELETE do app não apagaria nada (RLS filtra a linha e devolve 0 linhas).
CREATE POLICY "Motorista remove a ficha do seu veículo" ON public.driver_vehicles FOR DELETE
    USING (auth.uid() = driver_id);
