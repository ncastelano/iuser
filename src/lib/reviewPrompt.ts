// Pedido de AVALIAÇÃO sem acúmulo (11/11/2026, regra do dono: "não deixa acumular avaliações"): o app só pergunta sobre a ÚLTIMA coisa
// finalizada (corrida, compra ou serviço) dos últimos 2 dias e, quando a pessoa avalia OU fecha, tudo o que é mais antigo deixa de ser
// perguntado para sempre (a "linha do tempo" sobe para agora). Nunca há fila nem "mais N para avaliar". Vale na 3.0 (QuickReviewHost) e na
// 2.0 (FinishedOrderTrigger/FinishedRideTrigger), com a MESMA marca por pessoa neste aparelho. Regra pura testada: npm run test:review-prompt.

/** só o que terminou nos últimos 2 dias vira pergunta */
export const REVIEW_WINDOW_MS = 2 * 86400000

/** A única coisa a perguntar: a mais recente que terminou depois da marca e dentro da janela (ou nada). */
export function latestToReview<T extends { at: string | null | undefined }>(items: T[], seenUntil: number, now: number = Date.now()): T | null {
    const from = Math.max(seenUntil, now - REVIEW_WINDOW_MS)
    let best: T | null = null
    let bestAt = -Infinity
    for (const it of items) {
        const t = it.at ? Date.parse(it.at) : NaN
        if (!Number.isFinite(t) || t <= from) continue
        if (t > bestAt) { best = it; bestAt = t }
    }
    return best
}

const keyOf = (userId: string) => `iuser_reviews_until_${userId}`

/** até quando já foi perguntado/fechado (ms); 0 = nunca */
export function reviewsSeenUntil(userId: string): number {
    try { return Number(localStorage.getItem(keyOf(userId))) || 0 } catch { return 0 }
}

/** avaliou ou fechou: nada do que terminou até agora volta a ser perguntado */
export function closeAllReviews(userId: string, now: number = Date.now()): void {
    try { localStorage.setItem(keyOf(userId), String(now)); window.dispatchEvent(new Event('iuser-reviews-closed')) } catch { /* sem armazenamento */ }
}
