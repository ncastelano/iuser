// src/lib/rideRequestDraft.ts
//
// Rascunho do pedido de corrida (sobrevive a uma navegação pra outra
// página) — usado tanto no redirect pro login quanto na ida e volta pra
// escolher um local no mapa (rota própria, /pedir-motorista/escolher-local).
export const RIDE_DRAFT_KEY = 'pedir_motorista_draft_v1'

export function saveRideDraft(draft: Record<string, unknown>) {
    try {
        sessionStorage.setItem(RIDE_DRAFT_KEY, JSON.stringify(draft))
    } catch {
        // Ignora erros de armazenamento
    }
}

export function loadRideDraft(): Record<string, any> | null {
    try {
        const raw = sessionStorage.getItem(RIDE_DRAFT_KEY)
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

export function clearRideDraft() {
    try {
        sessionStorage.removeItem(RIDE_DRAFT_KEY)
    } catch {
        // Ignora erros de armazenamento
    }
}
