-- CPF/CNPJ do usuário — a Asaas exige isso pra criar uma cobrança/assinatura
-- de verdade (confirmado testando direto na API em sandbox: sem isso, toda
-- criação de assinatura falha com "é necessário preencher o CPF ou CNPJ do
-- cliente"). Guardado no perfil pra pedir só uma vez, reaproveitado em
-- qualquer plano que a pessoa assinar depois.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT;
