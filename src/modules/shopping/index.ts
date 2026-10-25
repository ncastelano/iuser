// src/modules/shopping/index.ts — API pública do domínio "compras"
export { servicePriceLabel, serviceCta, sortServices } from './domain'
export type { ShopService } from './domain'
export { isQuickAddable, matchesQuery, normalize, trendingScore, sortTrending, limitPerStore, distinctRecent } from './domain'
export type { ShopProduct } from './domain'
export { loadShop } from './load'
export type { ShopData } from './load'
