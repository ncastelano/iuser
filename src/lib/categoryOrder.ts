// A ORDEM das categorias do catálogo (página da loja, catálogo do cliente e Editar loja → Catálogo).
// A loja pode escolher a ordem (`stores.category_order`, migration 20261130000061); o que ela não escolheu vem DEPOIS, pela regra de sempre:
// "Promoções" primeiro e então as categorias com mais itens. Puro e testado (npm run test:category-order).

export const isPromoCategoryName = (n: string) => /promo/i.test(n)

/** as categorias `cats` na ordem: primeiro as escolhidas (na ordem da loja), depois as outras (Promoções, mais itens, nome) */
export function orderCategories(cats: string[], order: readonly string[] | null | undefined, count: (cat: string) => number): string[] {
    const chosen = (order || []).filter((c, i, a) => cats.includes(c) && a.indexOf(c) === i)
    const rest = cats.filter((c) => !chosen.includes(c))
        .sort((a, b) => Number(isPromoCategoryName(b)) - Number(isPromoCategoryName(a)) || count(b) - count(a) || a.localeCompare(b, 'pt-BR'))
    return [...chosen, ...rest]
}

/** junta a ordem escolhida de UM ambiente (ex.: Produtos) à ordem guardada, sem perder a dos outros ambientes */
export function mergeCategoryOrder(saved: readonly string[] | null | undefined, visibleNow: string[]): string[] {
    const others = (saved || []).filter((c) => !visibleNow.includes(c))
    return [...visibleNow, ...others].slice(0, 60)
}
