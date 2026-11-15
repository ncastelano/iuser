-- 20261130000058_postpaid_reference_follows_limit.sql
--
-- A base de comissão do Pós-pago (`network_settings.postpaid_reference_cents`) é só a REFERÊNCIA mostrada a quem indica ("uma quitação rende
-- cerca de R$ X"): a comissão de verdade é calculada sobre o valor REALMENTE pago na quitação, nunca sobre esta referência. Ela nasceu em
-- R$ 50 porque a quitação típica era R$ 50. Com o limite do Pós-pago em R$ 100 (migration 57), a quitação típica passa a ser maior, então a
-- referência acompanha — mas SÓ se ninguém a mudou: quem já a editou no Admin → Graduação mantém o valor dele.
UPDATE public.network_settings
   SET postpaid_reference_cents = 10000, updated_at = now()
 WHERE postpaid_reference_cents = 5000;
