// src/modules/service-requests/draft.ts
//
// Rascunho do pedido: sobrevive ao redirect pro login (sessionStorage). A mesma chave da tela da 2.0, então um
// rascunho começado numa versão continua na outra.

const DRAFT_KEY = 'pedir_servico_draft_v1'

export function saveDraft(draft: Record<string, unknown>) {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* sem armazenamento: segue sem rascunho */ }
}

export function loadDraft(): Record<string, any> | null {
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY)
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

export function clearDraft() {
    try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* idem */ }
}
