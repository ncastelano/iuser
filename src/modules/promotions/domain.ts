// src/modules/promotions/domain.ts — regras PURAS das promoções (combos) da loja: soma dos itens, desconto, validação do que a loja monta e leitura do "de/por" de um produto.
// A conta que vale é a do banco (`save_store_combo`); isto é só para mostrar o desconto na hora, antes de salvar.

export interface ComboLine { price: number; quantity: number }

export const COMBO_NAME_MIN = 3
export const COMBO_NAME_MAX = 80
export const COMBO_MAX_QTY = 20
export const COMBO_MAX_ITEMS = 30
/** Atalhos de desconto da tela de montar o combo (% sobre a soma dos itens). */
export const DISCOUNT_SHORTCUTS = [10, 15, 20, 30] as const

const cents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100)

/** Soma de tudo o que o combo leva (preço × quantidade), em reais, sem erro de ponto flutuante. */
export function comboTotal(lines: ComboLine[]): number {
    return lines.reduce((sum, l) => sum + cents(l.price) * Math.max(0, Math.floor(l.quantity || 0)), 0) / 100
}

/** Quanto a loja deu de desconto: valor e porcentagem (0 quando o valor não é menor que a soma). */
export function comboDiscount(total: number, price: number): { amount: number; pct: number } {
    if (!(total > 0) || !(price > 0) || price >= total) return { amount: 0, pct: 0 }
    return { amount: (cents(total) - cents(price)) / 100, pct: Math.round((1 - price / total) * 100) }
}

/** O valor que dá aquele % de desconto sobre a soma (arredondado ao centavo). */
export function priceForDiscountPct(total: number, pct: number): number {
    if (!(total > 0) || !(pct > 0) || pct >= 100) return total
    return Math.round(total * (1 - pct / 100) * 100) / 100
}

export type ComboError = 'name' | 'items' | 'quantity' | 'price' | 'above_total'

/** O que impede de salvar (null = pode salvar). Mesmas regras da função do banco. */
export function validateCombo(input: { name: string; lines: ComboLine[]; price: number }): ComboError | null {
    const name = (input.name || '').trim()
    if (name.length < COMBO_NAME_MIN || name.length > COMBO_NAME_MAX) return 'name'
    const lines = input.lines.filter((l) => l.quantity > 0)
    if (lines.length === 0 || lines.length > COMBO_MAX_ITEMS) return 'items'
    if (lines.some((l) => l.quantity > COMBO_MAX_QTY || !Number.isInteger(l.quantity))) return 'quantity'
    if (!(input.price > 0)) return 'price'
    if (cents(input.price) > cents(comboTotal(lines))) return 'above_total'
    return null
}

export const COMBO_ERROR_TEXT: Record<ComboError, string> = {
    name: 'Dê um nome ao combo (de 3 a 80 letras).',
    items: 'Escolha pelo menos um item da loja.',
    quantity: 'A quantidade de cada item vai de 1 a 20.',
    price: 'Informe o valor que você quer receber pelo combo.',
    above_total: 'O valor do combo não pode ser maior que a soma dos itens — senão não é promoção.',
}

/** Traduz o erro do banco (hint) em uma frase para a pessoa. */
export function comboErrorFromHint(hint: string | null | undefined): string {
    switch (hint) {
        case 'combo_name_invalid': return COMBO_ERROR_TEXT.name
        case 'combo_items_required': return COMBO_ERROR_TEXT.items
        case 'combo_quantity_invalid': return COMBO_ERROR_TEXT.quantity
        case 'combo_price_invalid': return COMBO_ERROR_TEXT.price
        case 'combo_price_above_total': return COMBO_ERROR_TEXT.above_total
        case 'combo_image_invalid': return 'A foto do combo não foi aceita. Envie a foto de novo.'
        case 'combo_item_invalid': return 'Um dos itens não está mais disponível na loja. Atualize a lista e escolha de novo.'
        case 'not_store_owner': return 'Só quem é dono da loja monta promoções.'
        default: return 'Não foi possível salvar o combo agora. Tente de novo.'
    }
}

/** "2× Pizza · 1× Guaraná" */
export function describeItems(lines: { name: string; quantity: number }[]): string {
    return lines.filter((l) => l.quantity > 0).map((l) => `${l.quantity}× ${l.name}`).join(' · ')
}

export interface PromoProduct { price: number; compare_at_price?: number | null; description?: string | null; category?: string | null }
export interface PromoInfo { old: number; pct: number; rest: string }

/** Lojas antigas escreviam "De R$ 29,90 por R$ 21,90." no começo da descrição: ainda lemos, para não perder essas ofertas. */
function legacyPromo(desc: string | null | undefined, price: number): PromoInfo | null {
    const m = (desc || '').match(/^\s*De\s+R\$\s*([\d.]+,\d{2})\s+por\s+R\$\s*[\d.]+,\d{2}\.?\s*/i)
    if (!m || !desc) return null
    const old = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
    if (!(old > price) || !(price > 0)) return null
    return { old, pct: Math.round((1 - price / old) * 100), rest: desc.slice(m[0].length) }
}

/** O "de/por" de um produto: o `compare_at_price` do banco (combos) ou, na falta, o texto antigo da descrição. null = não está em promoção. */
export function promoInfoOf(p: PromoProduct): PromoInfo | null {
    const price = Number(p.price)
    const cmp = p.compare_at_price == null ? null : Number(p.compare_at_price)
    if (cmp != null && cmp > price && price > 0) return { old: cmp, pct: Math.round((1 - price / cmp) * 100), rest: p.description || '' }
    return legacyPromo(p.description, price)
}

/** Vai para a seção de promoções (horizontal): tem desconto OU está na categoria "Promoções". */
export function isPromoProduct(p: PromoProduct): boolean {
    return promoInfoOf(p) != null || /promo/i.test(p.category || '')
}

// ===== Cartão do combo: foto enviada pela loja × colagem das fotos dos itens =====
export interface CollageItem { name: string; image_url: string | null; quantity: number }

/** Quantas fotos entram na colagem (no máximo 4) e quantos itens ficam de fora ("+N" na última). */
export function collageLayout(count: number): { tiles: 1 | 2 | 3 | 4; extra: number } {
    const n = Math.max(0, Math.floor(count || 0))
    if (n <= 1) return { tiles: 1, extra: 0 }
    if (n === 2) return { tiles: 2, extra: 0 }
    if (n === 3) return { tiles: 3, extra: 0 }
    return { tiles: 4, extra: n - 4 }
}

/** O combo mostra a COLAGEM das fotos dos itens (e não uma foto de fundo) quando a loja NÃO enviou foto do combo. */
export function usesCollage(p: { is_combo?: boolean | null; combo_image_uploaded?: boolean | null }, itemCount: number): boolean {
    return !!p.is_combo && !p.combo_image_uploaded && itemCount > 0
}

export const COMBO_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const COMBO_IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp'] as const

/** Confere a foto escolhida (tipo e tamanho) e devolve a extensão, ou a frase do problema. */
export function checkComboImage(file: { name: string; size: number }): { ext: string } | { error: string } {
    const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!(COMBO_IMAGE_EXTS as readonly string[]).includes(ext)) return { error: 'Envie uma foto JPG, PNG ou WebP.' }
    if (file.size > COMBO_IMAGE_MAX_BYTES) return { error: 'A foto pode ter até 5 MB.' }
    return { ext }
}
