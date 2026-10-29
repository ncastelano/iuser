// src/modules/moderation/domain.ts — regras puras da MODERAÇÃO (denunciar e ocultar): tipos, motivos e textos. Sem React nem rede; testado em scripts/test-moderation.mjs (npm run test:moderation).
// O que de fato oculta (3 denúncias de pessoas diferentes, conta com mais de 1 dia, limite de 20 por dia) e o que o admin decide moram no banco.

export type ReportTarget = 'flash' | 'flash_comment' | 'publication' | 'comment' | 'product_review' | 'community_message'
export type ReportReason = 'spam' | 'offensive' | 'sexual' | 'violence' | 'scam' | 'illegal' | 'other'
export type ReportResult = 'reported' | 'hidden' | 'already'
export type ModerationAction = 'hide' | 'clear' | 'restore'

export const TARGETS: { code: ReportTarget; label: string }[] = [
    { code: 'flash', label: 'Flash' },
    { code: 'flash_comment', label: 'Comentário de flash' },
    { code: 'publication', label: 'Publicação' },
    { code: 'comment', label: 'Comentário' },
    { code: 'product_review', label: 'Avaliação' },
    { code: 'community_message', label: 'Mensagem de comunidade' },
]
export const TARGET_LABEL: Record<ReportTarget, string> = Object.fromEntries(TARGETS.map((t) => [t.code, t.label])) as Record<ReportTarget, string>

export const REASONS: { code: ReportReason; label: string; hint: string }[] = [
    { code: 'spam', label: 'Spam', hint: 'Propaganda repetida ou sem sentido' },
    { code: 'offensive', label: 'Ofensivo', hint: 'Xingamento, ódio ou assédio' },
    { code: 'sexual', label: 'Conteúdo sexual', hint: 'Nudez ou conteúdo adulto' },
    { code: 'violence', label: 'Violência', hint: 'Ameaça ou violência' },
    { code: 'scam', label: 'Golpe ou fraude', hint: 'Tenta enganar ou tirar dinheiro' },
    { code: 'illegal', label: 'Ilegal', hint: 'Venda ou ação proibida' },
    { code: 'other', label: 'Outro', hint: 'Outro motivo' },
]
export const REASON_LABEL: Record<ReportReason, string> = Object.fromEntries(REASONS.map((r) => [r.code, r.label])) as Record<ReportReason, string>

/** Quantas pessoas diferentes precisam denunciar para o conteúdo ficar oculto até o admin decidir (a mesma regra do banco) */
export const HIDE_THRESHOLD = 3

/** O que dizer à pessoa depois de denunciar */
export function resultText(r: ReportResult): string {
    if (r === 'hidden') return 'Obrigado! O conteúdo foi ocultado até o iUser analisar.'
    if (r === 'already') return 'Você já denunciou isto. Obrigado!'
    return 'Obrigado! Vamos analisar a sua denúncia.'
}

/** Resumo dos motivos para o admin: "Spam ×2 · Golpe ×1" (mais citado primeiro) */
export function reasonSummary(reasons: ReportReason[]): string {
    const n = new Map<ReportReason, number>()
    for (const r of reasons) n.set(r, (n.get(r) || 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([r, c]) => `${REASON_LABEL[r] || r} ×${c}`).join(' · ')
}

/** Ações do admin, com o efeito de cada uma (a tela pede confirmação) */
export const ADMIN_ACTIONS: { code: ModerationAction; label: string; hint: string }[] = [
    { code: 'hide', label: 'Ocultar', hint: 'O conteúdo some para todos e o autor é avisado.' },
    { code: 'clear', label: 'Manter', hint: 'O conteúdo está certo: fica visível e não é ocultado de novo por denúncias.' },
    { code: 'restore', label: 'Restaurar', hint: 'Volta a aparecer (e pode ser ocultado de novo se for denunciado).' },
]
