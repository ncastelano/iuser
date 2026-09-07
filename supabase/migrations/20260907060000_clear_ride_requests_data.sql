-- Limpeza dos pedidos de corrida "fantasmas" acumulados em teste. Corridas
-- ficaram presas como pending (nunca aceitas/canceladas) e voltavam a
-- aparecer no quadro de /aceitar-corridas mesmo sem o passageiro conseguir
-- vê-las de volta em /pedir-motorista. Zera tudo antes de travar a regra de
-- "um pedido ativo por vez" na migração seguinte.
-- Cascata: ride_applications e ride_reviews referenciam ride_requests com
-- ON DELETE CASCADE, então somem junto.
DELETE FROM public.ride_requests;
