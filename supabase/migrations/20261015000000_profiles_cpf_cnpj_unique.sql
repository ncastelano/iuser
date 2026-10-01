-- Um CPF/CNPJ só pode estar vinculado a UM perfil do iUser. Antes disso só
-- o plano Pós-pago barrava duplicata de CPF (tabela postpaid_identities,
-- migration postpaid_plan_all_services) — e só na hora de ATIVAR o plano,
-- não no cadastro: dava pra criar quantas contas quisesse com o mesmo CPF
-- enquanto não tentasse ativar o Pós-pago. Agora a trava é no próprio
-- profiles.cpf_cnpj, cedo o bastante pra barrar o cadastro em si.
--
-- Checado em 2026-10-01 via REST (service role, só contagem — sem ler CPF
-- nem dado pessoal): de 12 perfis com cpf_cnpj preenchido, havia 1 CPF
-- duplicado entre 2 perfis. Pra essa migration não falhar ao criar o índice
-- único, zera o cpf_cnpj do perfil MAIS RECENTE de cada duplicata (mantém
-- no mais antigo) — não apaga nem desativa a conta, só limpa o campo; quem
-- ficou com o CPF zerado só vai precisar informar de novo na próxima vez
-- que for ativar um plano pago. Vale revisar manualmente no admin depois
-- do deploy pra confirmar que o perfil certo ficou com o CPF.
WITH duplicates AS (
    SELECT id,
           row_number() OVER (PARTITION BY cpf_cnpj ORDER BY created_at ASC) AS rn
    FROM public.profiles
    WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj <> ''
)
UPDATE public.profiles
SET cpf_cnpj = NULL
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_cnpj_unique_idx
    ON public.profiles (cpf_cnpj)
    WHERE cpf_cnpj IS NOT NULL AND cpf_cnpj <> '';
