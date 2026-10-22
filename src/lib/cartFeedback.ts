// src/lib/cartFeedback.ts
//
// Feedback ao adicionar no carrinho: o carrinho da barra (e o ícone do cartão do carrinho da página) balançam, e a página rola
// suavemente até o cartão "Seu carrinho" (quando a página tem um: elemento com o id informado), que dá uma pulsada de destaque —
// a pessoa vê que algo aconteceu e onde está o carrinho. Respeita "reduzir movimento" (só rola, sem balançar). Só apresentação.

const CART_ICONS = '[data-cart-target], button[aria-label="Carrinho"], button[aria-label="Ver carrinho"], [data-cart-wiggle]'

function wiggle(el: Element) {
    const node = (el.querySelector('svg') as Element | null) || el
    try {
        node.animate(
            [
                { transform: 'rotate(0deg) scale(1)' },
                { transform: 'rotate(-22deg) scale(1.25)', offset: 0.18 },
                { transform: 'rotate(18deg) scale(1.2)', offset: 0.36 },
                { transform: 'rotate(-12deg) scale(1.12)', offset: 0.54 },
                { transform: 'rotate(8deg) scale(1.06)', offset: 0.72 },
                { transform: 'rotate(-3deg) scale(1.02)', offset: 0.88 },
                { transform: 'rotate(0deg) scale(1)' },
            ],
            { duration: 780, easing: 'ease-in-out' },
        )
    } catch { /* sem animação */ }
}

function pulseCard(el: HTMLElement) {
    try {
        el.animate(
            [{ boxShadow: '0 8px 28px #f9731645' }, { boxShadow: '0 0 0 5px #f9731666, 0 12px 36px #f9731690' }, { boxShadow: '0 8px 28px #f9731645' }],
            { duration: 1100, easing: 'ease-in-out', iterations: 2 },
        )
    } catch { /* sem animação */ }
}

const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }

/** @param scrollToId id do cartão do carrinho na página (ele aparece logo depois de adicionar, então tenta por um instante) */
export async function cartAddedFeedback(opts: { scrollToId?: string } = {}): Promise<void> {
    if (typeof document === 'undefined') return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (!reduce) Array.from(document.querySelectorAll(CART_ICONS)).filter(visible).forEach(wiggle)

    if (!opts.scrollToId) return
    // o cartão do carrinho da página surge no próximo quadro (primeiro item) ou já existe (mais um item)
    for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 120 : 100))
        const card = document.getElementById(opts.scrollToId)
        if (card && visible(card)) {
            card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
            if (!reduce) {
                pulseCard(card)
                // o ícone do cartão balança de novo quando a câmera chega
                setTimeout(() => card.querySelectorAll('[data-cart-wiggle]').forEach(wiggle), 450)
            }
            return
        }
    }
}
