-- Excluir a conta de um indicado apagava (via _purge_rows) as comissões que
-- ele tinha gerado pro padrinho, mas o saque já feito ficava: saldo negativo.
-- O extrato da carteira é histórico financeiro: nunca é apagado por
-- exclusão de terceiros. A FK vira SET NULL (o purge ignora FKs SET NULL).
ALTER TABLE public.wallet_transactions
    DROP CONSTRAINT IF EXISTS wallet_transactions_source_subscription_id_fkey;
ALTER TABLE public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_source_subscription_id_fkey
    FOREIGN KEY (source_subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;

-- Conserta quem já ficou negativo: devolve o que foi apagado.
INSERT INTO public.wallet_transactions (user_id, type, amount, description)
SELECT user_id, 'commission_credit', -SUM(amount),
       'Ajuste: comissões removidas por exclusão de conta de indicado'
FROM public.wallet_transactions
GROUP BY user_id
HAVING SUM(amount) < 0;

-- Rede de segurança: nenhum lançamento pode deixar o saldo negativo.
CREATE OR REPLACE FUNCTION public.wallet_block_negative_balance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.amount < 0 AND
       (SELECT COALESCE(SUM(amount), 0) FROM public.wallet_transactions WHERE user_id = NEW.user_id) + NEW.amount < 0 THEN
        RAISE EXCEPTION 'Saldo insuficiente';
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS wallet_block_negative ON public.wallet_transactions;
CREATE TRIGGER wallet_block_negative BEFORE INSERT ON public.wallet_transactions
    FOR EACH ROW EXECUTE FUNCTION public.wallet_block_negative_balance();
