// src/modules/digital/index.ts — API pública do domínio "Produtos digitais"
export * from './domain'
export { loadDigitalShowcase, fetchCurriculum, fetchLibrary, openItem, releaseOrder, listOwnItems, addFileItem, addLinkItem, removeItem, setItemPreview, renameItem, swapItems } from './load'
export type { LibraryItem, OwnItem, OpenedItem, ShowcaseItem } from './load'
