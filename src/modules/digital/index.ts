// src/modules/digital/index.ts — API pública do domínio "Produtos digitais"
export * from './domain'
export { previewUrl, loadDigitalShowcase, fetchCurriculum, fetchLibrary, openItem, releaseOrder, listOwnItems, addFileItem, addLinkItem, removeItem, setItemPreview, renameItem, swapItems, claimFree, addAppItem, fetchAppInfo, sha256Hex, fetchMyAccess, fetchAudioPreview, hasRights, declareRights, fetchStoreDigitalSummary } from './load'
export type { LibraryItem, OwnItem, OpenedItem, ShowcaseItem } from './load'
