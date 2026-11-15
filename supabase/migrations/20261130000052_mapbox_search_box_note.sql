-- Financeiro (Admin): o Mapbox passa a ser usado também pela API SEARCH BOX (sugestões de endereços e LUGARES — hospital, mercado, loja, shopping — do "Definir localização").
-- Ela é cobrada por SESSÃO de busca (as sugestões enquanto a pessoa escreve + a escolha final contam como uma), com franquia grátis mensal; os valores estão no painel do Mapbox.
-- Mesmo token (NEXT_PUBLIC_MAPBOX_TOKEN) e mesmo serviço já cadastrado: só a nota ganha o uso novo. Sem mudar o custo cadastrado. Reaplicável.
UPDATE public.service_expenses
   SET notes = 'mapbox-gl no package.json (mapas) · Geocoding (endereços, rotas) · Search Box API (sugestões de lugares no Definir localização: src/components/LocationPicker.tsx; cobrada por sessão de busca)',
       updated_at = now()
 WHERE service_name = 'Mapbox'
   AND notes NOT LIKE '%Search Box%';
