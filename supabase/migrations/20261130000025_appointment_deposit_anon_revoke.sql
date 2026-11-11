-- Entrada no agendamento: visitante sem login (anon) não deve nem conseguir CHAMAR as funções da entrada. A migration 20261116 fez REVOKE ... FROM public e GRANT só para authenticated, mas o
-- Supabase dá EXECUTE a `anon` direto em toda função nova (não via PUBLIC), então o REVOKE não o tirou. Nada vazava (as funções recusam quem não está logado e só devolvem a linha ao cliente do
-- agendamento ou ao dono da loja), mas a regra do projeto é não depender só do corpo da função: o teste security_exposure_scenarios.sql acusou get_appointment_deposit (devolve a chave Pix).
-- Quem usa continua usando: todas pedem login e só são chamadas por pessoa logada. Rollback: supabase/rollbacks/appointment_deposit_anon_revoke_rollback.sql
REVOKE ALL ON FUNCTION public.report_appointment_deposit(uuid), public.confirm_appointment_deposit(uuid), public.refund_appointment_deposit(uuid), public.get_appointment_deposit(uuid) FROM anon;
