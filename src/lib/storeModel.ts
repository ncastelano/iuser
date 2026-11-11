// Modelos de loja (coluna `stores.store_model`): mudam só a APRESENTAÇÃO da página — o botão central e a ordem do que aparece.
//   products → COMPRAR é o botão central; services → AGENDAR é o botão central (serviços em linhas); mixed → COMPRAR e AGENDAR lado a lado.
//   Modelos de CRIADOR (09/11/2026), sem botão de comprar no topo — a página abre no conteúdo:
//   studio → MÚSICA e VÍDEO, com a música/álbum/vídeo PRINCIPAL em destaque no lugar do botão;
//   content → AUDIOLIVROS e PODCASTS, com o audiolivro/podcast em destaque;
//   publisher (Editora) → LIVROS em PDF, em estante, com "Ler prévia" (algumas páginas) ou "Ler grátis" (o livro todo, se for grátis).
// Nada de permissão, preço ou pedido depende do modelo. O dono escolhe ao criar a loja e pode trocar no painel.
export type StoreModel = 'products' | 'services' | 'mixed' | 'studio' | 'content' | 'publisher'
export type CreatorModel = 'studio' | 'content' | 'publisher'

export const STORE_MODELS: { id: StoreModel; title: string; desc: string; main: string; needsAgenda: boolean }[] = [
    { id: 'products', title: 'Loja de produtos', desc: 'Você vende produtos e recebe pedidos.', main: 'Botão central: Comprar', needsAgenda: false },
    { id: 'services', title: 'Loja de atendimento', desc: 'Você presta serviços com hora marcada.', main: 'Botão central: Agendar', needsAgenda: true },
    { id: 'mixed', title: 'Loja mista', desc: 'Você vende produtos e também atende.', main: 'Botões: Comprar e Agendar', needsAgenda: true },
    { id: 'studio', title: 'Studio', desc: 'Você lança músicas, álbuns e vídeos.', main: 'No topo: a música, o álbum ou o vídeo principal', needsAgenda: false },
    { id: 'content', title: 'Conteúdo', desc: 'Você produz audiolivros e podcasts.', main: 'No topo: o audiolivro ou podcast em destaque', needsAgenda: false },
    { id: 'publisher', title: 'Editora', desc: 'Você vende livros em PDF.', main: 'Estante de livros com prévia das páginas', needsAgenda: false },
]
const ALL_MODELS: StoreModel[] = ['products', 'services', 'mixed', 'studio', 'content', 'publisher']
export const isCreatorModel = (m: StoreModel): m is CreatorModel => m === 'studio' || m === 'content' || m === 'publisher'

/** Como a página de uma loja de CRIADOR se monta: o nome da aba dos conteúdos, se tem destaque no topo e a ordem das prateleiras. */
export function creatorPage(m: CreatorModel) {
    if (m === 'studio') return { tab: 'Músicas e vídeos', hero: true, shelfOrder: ['musicas', 'filmes', 'cursos', 'podcasts', 'audiolivros', 'arquivos', 'programas'], heroKinds: ['album', 'musica', 'playlist', 'filme', 'aula', 'curso'] }
    if (m === 'content') return { tab: 'Audiolivros e podcasts', hero: true, shelfOrder: ['audiolivros', 'podcasts', 'musicas', 'cursos', 'filmes', 'arquivos', 'programas'], heroKinds: ['audiolivro', 'podcast'] }
    return { tab: 'Livros', hero: false, shelfOrder: ['arquivos', 'audiolivros', 'podcasts', 'cursos', 'musicas', 'filmes', 'programas'], heroKinds: [] as string[] }
}

export function parseStoreModel(v: unknown): StoreModel {
    return ALL_MODELS.includes(v as StoreModel) ? (v as StoreModel) : 'mixed'
}

/** Sugestão de modelo pela categoria escolhida (a pessoa pode trocar). */
export function suggestModelForCategory(categorySlug: string): StoreModel {
    if (['servicos', 'saude', 'pets'].includes(categorySlug)) return 'services'
    if (['alimentacao', 'moda', 'casa', 'eletronicos'].includes(categorySlug)) return 'products'
    return 'mixed'
}

/** O que a página mostra como ação principal, dado o modelo e se a agenda está ligada. */
export function pageActions(model: StoreModel, agendaOn: boolean, hasGoods: boolean) {
    // criador: sem Comprar nem Agendar no topo (o topo é o conteúdo); produtos e serviços, se houver, ficam nas abas
    if (isCreatorModel(model)) return { buy: false, schedule: false, productsSecondary: false, servicesFirst: false, serviceRows: true }
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
