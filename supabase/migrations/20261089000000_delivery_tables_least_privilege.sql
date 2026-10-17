-- Etapa 1.5 / Grupo D — menor privilégio nas tabelas da entrega iUser (criadas na sessão anterior).
-- Visitante sem login não precisa de nenhuma delas (as policies já devolviam vazio; aqui nem o privilégio fica);
-- a fila de eventos e as configurações são do servidor.
REVOKE ALL ON public.order_delivery_dispatches, public.order_delivery_rounds, public.order_delivery_counters,
              public.order_delivery_events, public.delivery_dispatch_settings FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.order_delivery_dispatches, public.order_delivery_rounds, public.order_delivery_counters,
              public.order_delivery_events, public.delivery_dispatch_settings, public.ride_offers FROM authenticated;
-- order_delivery_events só é lida/escrita pelo servidor (service role): nenhum privilégio para o app
REVOKE ALL ON public.order_delivery_events FROM authenticated;
-- escrita nas tabelas de entrega só pelas funções do servidor: o cliente só lê (as policies já não têm INSERT/UPDATE/DELETE)
REVOKE INSERT, UPDATE, DELETE ON public.order_delivery_dispatches, public.order_delivery_rounds, public.order_delivery_counters,
              public.delivery_dispatch_settings, public.ride_offers FROM authenticated;
