// src/modules/promotions/index.ts — API pública do domínio "Promoções da loja" (combos)
export * from './domain'
export { listComboCandidates, listStoreCombos, fetchComboItems, saveCombo, uploadComboImage, comboImageUrl, setComboActive, deleteCombo, fetchHomePromotions } from './load'
export type { ComboItem, StoreCombo, CandidateItem, PromotionShowcaseItem } from './load'
