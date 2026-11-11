// src/modules/flash/index.ts — API pública do domínio "Flash" (feed de pessoas)
export * from './domain'
export { PAGE_SIZE, fetchFeed, mediaSrc, authorAvatarUrl, postFlash, deleteFlash, setLiked, setFollowing, fetchComments, addComment, deleteComment, countShare } from './load'
export type { FlashComment } from './load'
