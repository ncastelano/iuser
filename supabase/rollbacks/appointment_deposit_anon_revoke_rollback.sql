-- Desfaz 20261130000025: devolve EXECUTE a anon (o estado de antes; as funções seguem recusando quem não está logado).
GRANT EXECUTE ON FUNCTION public.report_appointment_deposit(uuid), public.confirm_appointment_deposit(uuid), public.refund_appointment_deposit(uuid), public.get_appointment_deposit(uuid) TO anon;
