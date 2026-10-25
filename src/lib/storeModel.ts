// Modelos de loja (coluna `stores.store_model`): mudam só a APRESENTAÇÃO da página — o botão central e a ordem do que aparece.
//   products → COMPRAR é o botão central; services → AGENDAR é o botão central (serviços em linhas); mixed → COMPRAR e AGENDAR lado a lado.
// Nada de permissão, preço ou pedido depende do modelo. O dono escolhe ao criar a loja e pode trocar no painel.
export type StoreModel = 'products' | 'services' | 'mixed'

export const STORE_MODELS: { id: StoreModel; title: string; desc: string; main: string; needsAgenda: boolean }[] = [
    { id: 'products', title: 'Loja de produtos', desc: 'Você vende produtos e recebe pedidos.', main: 'Botão central: Comprar', needsAgenda: false },
    { id: 'services', title: 'Loja de atendimento', desc: 'Você presta serviços com hora marcada.', main: 'Botão central: Agendar', needsAgenda: true },
    { id: 'mixed', title: 'Loja mista', desc: 'Você vende produtos e também atende.', main: 'Botões: Comprar e Agendar', needsAgenda: true },
]

export function parseStoreModel(v: unknown): StoreModel {
    return v === 'products' || v === 'services' || v === 'mixed' ? v : 'mixed'
}

/** Sugestão de modelo pela categoria escolhida (a pessoa pode trocar). */
export function suggestModelForCategory(categorySlug: string): StoreModel {
    if (['servicos', 'saude', 'pets'].includes(categorySlug)) return 'services'
    if (['alimentacao', 'moda', 'casa', 'eletronicos'].includes(categorySlug)) return 'products'
    return 'mixed'
}

/** O que a página mostra como ação principal, dado o modelo e se a agenda está ligada. */
export function pageActions(model: StoreModel, agendaOn: boolean, hasGoods: boolean) {
    const schedule = agendaOn && model !== 'products'
    return {
        buy: model === 'products' || (model === 'mixed') || (model === 'services' && !agendaOn),
        schedule,
        // loja de atendimento com produtos: "Produtos" vira botão discreto
        productsSecondary: model === 'services' && hasGoods,
        servicesFirst: model === 'services' || (model === 'mixed' && !hasGoods),
        serviceRows: model !== 'products',
    }
}
