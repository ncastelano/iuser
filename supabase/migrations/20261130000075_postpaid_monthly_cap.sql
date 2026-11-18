-- 20261130000075_postpaid_monthly_cap.sql
--
-- TETO MENSAL DO PÓS-PAGO (18/11/2026; estudo docs/estudos/2026-11-18-delivery-concorrencia-dinheiro.md): quem usa o Pós-pago paga R$ 0,50 por uso, mas
-- NUNCA mais que o preço do Pré-pago no mesmo mês (hoje R$ 100). Antes, com 600 pedidos no mês, o Pós custava R$ 300 contra R$ 100 do Pré — a loja que
-- não percebia se sentia enganada. A frase de venda passa a ser: "R$ 0,50 por uso, nunca mais que R$ 100 por mês, sem comissão".
-- Como: um gatilho ANTES de cada cobrança (driver_postpaid_charges) soma o que a pessoa já pagou NO MÊS (calendário de Porto Velho; pagamentos — type
-- 'payment', valores negativos — não contam) e corta a cobrança no que falta para o teto; passou do teto, a linha entra com R$ 0,00 (fica no extrato como
-- "incluído no teto do mês"). O limite de dívida (postpaid_settings.debt_limit) continua decidindo quando TRAVA.
-- O teto mora em postpaid_settings.monthly_cap (NULL = sem teto) e é lido por get_postpaid_monthly_cap() (pública, é só um número).
-- Rollback: supabase/rollbacks/postpaid_monthly_cap_rollback.sql. Cenários: supabase/tests/postpaid_monthly_cap_scenarios.sql.

ALTER TABLE public.postpaid_settings ADD COLUMN IF NOT EXISTS monthly_cap numeric(10,2) DEFAULT 100 CHECK (monthly_cap IS NULL OR monthly_cap >= 1);
UPDATE public.postpaid_settings SET monthly_cap = 100 WHERE monthly_cap IS NULL;

CREATE OR REPLACE FUNCTION public.get_postpaid_monthly_cap() RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT monthly_cap FROM public.postpaid_settings WHERE id
$$;
REVOKE ALL ON FUNCTION public.get_postpaid_monthly_cap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_postpaid_monthly_cap() TO anon, authenticated, service_role;

-- o que a pessoa já foi cobrada no mês corrente (só cobranças; os pagamentos ficam de fora)
CREATE OR REPLACE FUNCTION public._postpaid_month_charged(p_person uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT COALESCE(sum(amount), 0) FROM public.driver_postpaid_charges
     WHERE driver_id = p_person AND type <> 'payment' AND amount > 0
       AND created_at >= (date_trunc('month', now() AT TIME ZONE 'America/Porto_Velho') AT TIME ZONE 'America/Porto_Velho')
$$;
REVOKE ALL ON FUNCTION public._postpaid_month_charged(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_postpaid_monthly_cap() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cap numeric; v_used numeric;
BEGIN
    IF NEW.type = 'payment' OR COALESCE(NEW.amount, 0) <= 0 THEN RETURN NEW; END IF;
    SELECT monthly_cap INTO v_cap FROM public.postpaid_settings WHERE id;
    IF v_cap IS NULL THEN RETURN NEW; END IF;
    -- uma pessoa por vez (dois usos ao mesmo tempo não passam juntos do teto)
    PERFORM pg_advisory_xact_lock(hashtext('postpaid_cap:' || NEW.driver_id::text));
    v_used := public._postpaid_month_charged(NEW.driver_id);
    NEW.amount := GREATEST(0, LEAST(NEW.amount, v_cap - v_used));
    RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.trg_postpaid_monthly_cap() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS driver_postpaid_charges_monthly_cap ON public.driver_postpaid_charges;
CREATE TRIGGER driver_postpaid_charges_monthly_cap BEFORE INSERT ON public.driver_postpaid_charges FOR EACH ROW EXECUTE FUNCTION public.trg_postpaid_monthly_cap();

-- para a tela "Meu plano": quanto já foi cobrado no mês e quanto falta para o teto
CREATE OR REPLACE FUNCTION public.get_my_postpaid_month() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_cap numeric; v_used numeric;
BEGIN
    IF uid IS NULL THEN RETURN NULL; END IF;
    SELECT monthly_cap INTO v_cap FROM public.postpaid_settings WHERE id;
    v_used := public._postpaid_month_charged(uid);
    RETURN jsonb_build_object('cap', v_cap, 'charged', v_used, 'left', CASE WHEN v_cap IS NULL THEN NULL ELSE GREATEST(0, v_cap - v_used) END,
                              'reached', v_cap IS NOT NULL AND v_used >= v_cap);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_postpaid_month() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_postpaid_month() TO authenticated;
