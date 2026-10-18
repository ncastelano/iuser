// src/lib/checkCpfCnpjAvailable.ts
//
// Um CPF/CNPJ só pode estar vinculado a UM perfil do iUser (índice único
// profiles_cpf_cnpj_unique_idx, migration 20261001000000_profiles_cpf_cnpj_unique.sql).
// Usado nos 3 fluxos de cadastro de conta (LoginAndRegister, /cadastrar,
// /criar-loja-com-cadastro) pra barrar com uma mensagem clara ANTES de criar
// o usuário no Auth — sem isso, a pessoa só ia descobrir o problema depois
// do auth.signUp() já ter rodado, quando o insert no profiles batesse no
// índice único.
//
// A coluna `cpf_cnpj` é privada (o navegador não a lê): a pergunta vai para o servidor, que só devolve sim/não.
export async function isCpfCnpjTaken(cleanCpfCnpj: string): Promise<boolean> {
    try {
        const res = await fetch('/api/auth/cpf-available', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cpfCnpj: cleanCpfCnpj }),
        })
        if (!res.ok) return false // o índice único do banco ainda barra a duplicidade no insert
        const json = await res.json()
        return !!json.taken
    } catch {
        return false
    }
}

export const CPF_CNPJ_TAKEN_MESSAGE = 'Esse CPF/CNPJ já está cadastrado em outra conta do iUser.'
