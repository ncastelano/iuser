// src/modules/shopping/index.ts — API pública do domínio "compras"
export { isQuickAddable, matchesQuery, normalize, trendingScore, sortTrending, limitPerStore, distinctRecent } from './domain'
export type { ShopProduct } from './domain'
export { loadShop } from './load'
export type { ShopData } from './load'
