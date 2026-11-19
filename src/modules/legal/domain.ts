// src/modules/legal/domain.ts — regras puras dos ACEITES LEGAIS (migration 20261130000082). Testado em npm run test:legal.
// Quem aceitou, qual versão e quando moram no banco (legal_acceptances); a versão em vigor também é do banco (legal_documents).

export type LegalDoc = 'terms' | 'driver_requirements' | 'store_regulated'
export interface LegalStatus { version: string; title: string; accepted: boolean; acceptedAt: string | null }
export type MyLegal = Partial<Record<LegalDoc, LegalStatus>>

export function parseMyLegal(raw: unknown): MyLegal {
    if (!raw || typeof raw !== 'object') return {}
    const out: MyLegal = {}
    for (const [k, v] of Object.entries(raw as Record<string, any>)) {
        if (!['terms', 'driver_requirements', 'store_regulated'].includes(k) || !v) continue
        out[k as LegalDoc] = { version: String(v.version || ''), title: String(v.title || ''), accepted: v.accepted === true, acceptedAt: v.accepted_at ?? null }
    }
    return out
}

/** As frases que a pessoa declara (iguais às mostradas na tela antes de aceitar) */
export const DECLARATIONS: Record<Exclude<LegalDoc, 'terms'>, { title: string; intro: string; items: string[]; button: string }> = {
    driver_requirements: {
        title: 'Antes de ficar online',
        intro: 'Motoristas e entregadores do iUser são profissionais independentes. Para levar pessoas ou pedidos, confirme que:',
        items: [
            'Tenho habilitação válida para o meu veículo e, para carro e moto, com a observação "exerce atividade remunerada" (EAR).',
            'Os documentos do veículo estão em dia e ele está em condições seguras.',
            'Se levo passageiros, tenho o seguro de Acidentes Pessoais a Passageiros (APP), como manda a Lei 13.640/2018.',
            'Sigo as regras de trânsito e as exigências da minha cidade para transporte de passageiros e motofrete.',
            'As informações do meu cadastro (foto, veículo) são verdadeiras.',
        ],
        button: 'Declaro que é verdade e quero ficar online',
    },
    store_regulated: {
        title: 'Produtos com regra própria',
        intro: 'Se a sua loja vende algum destes produtos, confirme que tem as licenças e segue as regras de cada um:',
        items: [
            'Medicamentos: só farmácia ou drogaria licenciada, com farmacêutico, e sem vender remédio controlado sem receita.',
            'Bebidas alcoólicas e tabaco: nunca para menores de 18 anos (é crime, ECA art. 243).',
            'Gás de cozinha (GLP): só revenda autorizada pela ANP.',
            'Alimentos, produtos para animais e outros com fiscalização: alvará e licenças da vigilância sanitária em dia.',
        ],
        button: 'Declaro que tenho as licenças',
    },
}

/** Páginas em que a janela dos Termos NÃO aparece (a pessoa precisa conseguir ler os textos e entrar) */
export function termsGateHidden(path: string): boolean {
    return /^\/(termos|privacidade|login|cadastrar|convite|dev-login|tres-telas|entregador|acompanhar-corrida)(\/|$|\?)/.test(path)
}

/** CPF/CNPJ: confere os dígitos (a mesma conta do banco, _doc_valid) para avisar antes de salvar */
export function docValid(type: 'cpf' | 'cnpj', raw: string): boolean {
    const d = (raw || '').replace(/\D/g, '')
    if (type === 'cpf') {
        if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
        const dig = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r }
        return dig(9) === Number(d[9]) && dig(10) === Number(d[10])
    }
    if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], w2 = [6, ...w1]
    const dig = (w: number[]) => { let s = 0; w.forEach((x, i) => { s += Number(d[i]) * x }); const r = s % 11; return r < 2 ? 0 : 11 - r }
    return dig(w1) === Number(d[12]) && dig(w2) === Number(d[13])
}

/** Máscara enquanto digita */
export function formatDoc(type: 'cpf' | 'cnpj', raw: string): string {
    const d = (raw || '').replace(/\D/g, '').slice(0, type === 'cpf' ? 11 : 14)
    if (type === 'cpf') return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}
