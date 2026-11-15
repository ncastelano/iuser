-- Devolve a referência de comissão do Pós-pago para R$ 50 (desfaz 20261130000058; só se ainda estiver no valor que a migration pôs).
UPDATE public.network_settings SET postpaid_reference_cents = 5000, updated_at = now() WHERE postpaid_reference_cents = 10000;
