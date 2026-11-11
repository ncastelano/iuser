// src/modules/favorites/domain.ts — regras puras dos MOTORISTAS FAVORITOS da loja: textos, tempos da janela de exclusividade e contagem regressiva.
// Sem React nem rede; testado em scripts/test-favorites.mjs (npm run test:favorites). A regra em si (quem vê, quem aceita, quando abre) mora no banco.

export type FavoriteStatus = 'invited' | 'accepted' | 'declined'

/** Tempos que a loja pode escolher para a janela (segundos); o banco confere a mesma lista */
export const WINDOW_CHOICES = [60, 120, 180, 300] as const
export const DEFAULT_WINDOW = 120
export const MAX_FAVORITES = 10

export interface FavoriteDriver {
    driverId: string
    name: string
    slug: string | null
    photo: string | null
    status: FavoriteStatus
    online: boolean
    deliveries: number
    ratingAvg: number | null
    ratingCount: number
}
export interface FavoritesState { items: FavoriteDriver[]; favoritesFirst: boolean; windowSeconds: number }
export interface DriverSuggestion { driverId: string; name: string; slug: string | null; photo: string | null; deliveries: number; ratingAvg: number | null; ratingCount: number }
export interface MyFavoriteStore { storeId: string; storeName: string; storeSlug: string | null; logo: string | null; status: FavoriteStatus; invitedAt: string }
export interface ExclusiveOffer { rideId: string; until: string; storeName: string }

/** "1 min", "2 min"... */
export const windowLabel = (s: number) => `${Math.round(s / 60)} min`

/** Segundos que faltam até `until` (nunca negativo) */
export const secondsLeft = (until: string | number | Date, now = Date.now()) => Math.max(0, Math.ceil((new Date(until).getTime() - now) / 1000))

/** "1:30" */
export function countdown(seconds: number): string {
    const m = Math.floor(seconds / 60), s = seconds % 60
    return `${m}:${String(s).padStart(2, '0')}`
}

/** Só os que já aceitaram contam como favoritos de verdade */
export const acceptedOnly = (items: FavoriteDriver[]) => items.filter((i) => i.status === 'accepted')
export const slotsLeft = (items: FavoriteDriver[]) => Math.max(0, MAX_FAVORITES - items.filter((i) => i.status !== 'declined').length)

/** Frase da loja para o resumo (ex.: "2 favoritos · 1 online agora") */
export function summaryLine(items: FavoriteDriver[]): string {
    const acc = acceptedOnly(items), on = acc.filter((i) => i.online).length, pend = items.filter((i) => i.status === 'invited').length
    const parts = [`${acc.length} ${acc.length === 1 ? 'favorito' : 'favoritos'}`]
    if (acc.length) parts.push(`${on} online agora`)
    if (pend) parts.push(`${pend} ${pend === 1 ? 'convite esperando' : 'convites esperando'}`)
    return parts.join(' · ')
}

/** O que a loja escolhe ao chamar manualmente: só oferece "Favoritos primeiro" se há algum favorito aceito */
export const canChooseFavorites = (items: FavoriteDriver[]) => acceptedOnly(items).length > 0
