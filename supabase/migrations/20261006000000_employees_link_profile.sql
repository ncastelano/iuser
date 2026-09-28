-- Deixa um "funcionário" ser vinculado a uma conta real do iUser (em vez de
-- só nome/telefone soltos), pra essa pessoa ver suas entregas logada no
-- próprio app (aba "Tarefas" no perfil) em vez de depender só do link mágico
-- por WhatsApp. `employees` não tem migration de criação rastreada (vive só
-- no Supabase ao vivo, ver 20261002020000_courier_delivery_access.sql) —
-- aditivo aqui também.
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS employees_user_id_idx ON public.employees (user_id);
