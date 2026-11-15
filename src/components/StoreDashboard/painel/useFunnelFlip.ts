'use client'

// A ANIMAÇÃO do funil de pedidos do painel da loja (a mesma do laboratório /painel-teste):
//   · FLIP — antes de mudar de etapa, `marcar()` fotografa a posição de tudo que tem `data-flip`; quando a lista chega do banco com o pedido na
//     etapa nova, cada elemento desliza do lugar antigo ao novo: o cartão DESCE até a etapa seguinte (1,5 s, sombra, leve aumento) e os vizinhos
//     se reacomodam (1,2 s);
//   · a COR vem POR TRÁS — o cartão cobre a faixa lateral durante a descida, a placa troca de cor escondida e, no fim, o cartão encolhe 4 px e a
//     cor nova aparece; um anel colorido acompanha e some; o botão também muda de cor e o texto novo aparece no meio;
//   · a CÂMERA acompanha — a página rola junto para o cartão ficar no mesmo ponto da tela (o dedo/roda do mouse interrompem).
// Respeita "reduzir movimento".
import { useLayoutEffect, useRef, useState } from 'react'

export const FLIP_MS = 1500

function seguir(el: HTMLElement, topoInicial: number) {
    let sp: HTMLElement | null = el.parentElement
    while (sp && !(/(auto|scroll)/.test(getComputedStyle(sp).overflowY) && sp.scrollHeight > sp.clientHeight)) sp = sp.parentElement
    const alvo = Math.min(Math.max(topoInicial, 150), window.innerHeight - 280)
    let parou = false
    const para = () => { parou = true }
    window.addEventListener('wheel', para, { once: true, passive: true })
    window.addEventListener('touchstart', para, { once: true, passive: true })
    const t0 = performance.now()
    const passo = () => {
        if (parou || performance.now() - t0 > FLIP_MS + 150) return
        const k = Math.min(1, (performance.now() - t0) / 600)
        const d = el.getBoundingClientRect().top - (topoInicial + (alvo - topoInicial) * k)
        if (Math.abs(d) > 0.5) { if (sp) sp.scrollTop += d; else window.scrollBy(0, d) }
        requestAnimationFrame(passo)
    }
    requestAnimationFrame(passo)
}

/** `dep` = a lista que muda quando o pedido troca de etapa; `keyOf(id)` = o valor de data-flip do cartão */
export function useFunnelFlip(dep: unknown) {
    const flip = useRef<Map<string, DOMRect> | null>(null)
    const mov = useRef<{ key: string; de: string; para: string } | null>(null)
    const [chegou, setChegou] = useState<string | null>(null)

    /** chame ANTES de mandar o pedido para a etapa seguinte */
    const marcar = (key: string, de: string, para: string) => {
        const m = new Map<string, DOMRect>()
        document.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => m.set(el.dataset.flip!, el.getBoundingClientRect()))
        flip.current = m
        mov.current = { key, de, para }
    }
    /** a ação falhou: esquece a foto */
    const cancelar = () => { flip.current = null; mov.current = null }

    useLayoutEffect(() => {
        const antes = flip.current
        const cc = mov.current
        if (!antes || !cc) return
        const alvo = document.querySelector<HTMLElement>(`[data-flip="${cc.key}"]`)
        // o pedido ainda está na etapa antiga (a lista que chegou ainda não tem a mudança): espera a próxima atualização
        if (alvo && alvo.getAttribute('data-stage') === cc.de) return
        flip.current = null
        mov.current = null
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        setChegou(cc.key)
        setTimeout(() => setChegou((c) => (c === cc.key ? null : c)), FLIP_MS + 1800)
        document.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
            const o = antes.get(el.dataset.flip!)
            if (!o) return
            const n = el.getBoundingClientRect()
            const dx = o.left - n.left, dy = o.top - n.top
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
            const voando = el.dataset.flip === cc.key
            el.animate(voando
                ? [{ transform: `translate(${dx}px,${dy}px) scale(1.04)`, boxShadow: '0 16px 36px rgba(0,0,0,.3)', zIndex: 30 }, { transform: 'translate(0,0) scale(1.04)', boxShadow: '0 16px 36px rgba(0,0,0,.3)', zIndex: 30, offset: 0.85 }, { transform: 'none', boxShadow: '0 0 0 rgba(0,0,0,0)', zIndex: 30 }]
                : [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }],
                { duration: voando ? FLIP_MS : 1200, easing: 'cubic-bezier(.45,0,.2,1)' })
            if (voando) {
                seguir(el, o.top)
                const opt = { duration: FLIP_MS, easing: 'ease-in-out' as const }
                el.animate([{ backgroundColor: cc.de, outline: `3px solid ${cc.de}`, outlineOffset: '2px' }, { backgroundColor: cc.para, outline: `3px solid ${cc.para}`, outlineOffset: '2px', offset: 0.82 }, { backgroundColor: cc.para, outline: `3px solid ${cc.para}00`, outlineOffset: '2px' }], opt)
                el.querySelector<HTMLElement>('[data-card]')?.animate([{ marginLeft: '0px' }, { marginLeft: '0px', offset: 0.78 }, { marginLeft: '4px' }], opt)
                el.querySelectorAll<HTMLElement>('[data-acao]').forEach((b) => b.animate([{ backgroundColor: cc.de }, { backgroundColor: cc.para }], opt))
                el.querySelectorAll<HTMLElement>('[data-troca]').forEach((t) => t.animate([{ opacity: 0.15 }, { opacity: 0.15, offset: 0.5 }, { opacity: 1 }], opt))
            }
        })
    }, [dep])   // eslint-disable-line react-hooks/exhaustive-deps

    return { marcar, cancelar, chegou }
}
