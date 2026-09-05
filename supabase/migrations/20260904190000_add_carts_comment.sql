-- O carrinho agora pode ter duas linhas do mesmo produto com observações
-- diferentes (ex.: "sem cebola" e "bem passado"), que precisam sobreviver
-- ao sync com o Supabase (loadFromSupabase/syncToSupabase) sem se misturar.
ALTER TABLE public.carts ADD COLUMN IF NOT EXISTS comment TEXT;
