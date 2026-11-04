// src/modules/search/index.ts — API pública do domínio "busca"
export * from './domain'
export { loadTrends, getRecent, recordSearch, forgetSearch, clearSearches, searchEverything, hitImageUrl } from './load'
