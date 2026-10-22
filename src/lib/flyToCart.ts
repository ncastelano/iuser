// src/lib/flyToCart.ts
//
// Feedback ao adicionar no carrinho: uma bolinha com a foto do produto sai de onde a pessoa estava e voa até o ícone do carrinho
// (que dá um pulinho), para ficar claro que algo aconteceu. Se o carrinho não estiver à vista (ex.: página rolada na 2.0), a tela
// sobe suavemente até ele antes. Respeita "reduzir movimento" (só o pulinho). Só apresentação: não mexe no carrinho em si.
// O alvo é o elemento com `data-cart-target` (ou o botão "Carrinho" da barra).

function findTarget(): HTMLElement | null {
    const all = Array.from(document.querySelectorAll<HTMLElement>('[data-cart-target], button[aria-label="Carrinho"], button[aria-label="Ver carrinho"]'))
    return all.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }) || null
}

const inView = (r: DOMRect) => r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth

function bump(target: HTMLElement) {
    try {
        target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.28)' }, { transform: 'scale(0.94)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'ease-out' })
        const r = target.getBoundingClientRect()
        const ring = document.createElement('span')
        ring.style.cssText = `position:fixed;left:${r.left + r.width / 2 - 20}px;top:${r.top + r.height / 2 - 20}px;width:40px;height:40px;border-radius:9999px;border:2px solid #f97316;pointer-events:none;z-index:2147483000;`
        document.body.appendChild(ring)
        ring.animate([{ transform: 'scale(.6)', opacity: 0.9 }, { transform: 'scale(2.1)', opacity: 0 }], { duration: 650, easing: 'ease-out' }).onfinish = () => ring.remove()
    } catch { /* sem animação */ }
}

/** @param from elemento (ou retângulo) de onde a bolinha sai; sem ele, sai do centro-baixo da tela */
export async function flyToCart(opts: { from?: Element | DOMRect | null; imageUrl?: string | null } = {}): Promise<void> {
    if (typeof document === 'undefined') return
    let target = findTarget()
    if (!target) return
    // o ponto de partida é lido AGORA (o botão/modal de onde sai pode sumir logo depois)
    const src0 = opts.from instanceof Element ? opts.from.getBoundingClientRect() : opts.from || null
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    // o carrinho está fora da tela? sobe até ele (a "câmera" vai até o carrinho)
    if (!inView(target.getBoundingClientRect())) {
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
        await new Promise((r) => setTimeout(r, reduce ? 0 : 450))
        target = findTarget() || target
    }
    if (reduce) { bump(target); return }

    const t = target.getBoundingClientRect()
    const src = src0 && src0.width > 0 ? src0 : null
    const size = 54
    const sx = src ? src.left + src.width / 2 : window.innerWidth / 2
    const sy = src ? src.top + src.height / 2 : window.innerHeight * 0.75
    const tx = t.left + t.width / 2
    const ty = t.top + t.height / 2

    const el = document.createElement('div')
    el.style.cssText = `position:fixed;left:${-size / 2}px;top:${-size / 2}px;width:${size}px;height:${size}px;border-radius:9999px;overflow:hidden;z-index:2147483000;pointer-events:none;
        background:linear-gradient(135deg,#f97316,#dc2626);box-shadow:0 10px 28px rgba(249,115,22,.55);display:flex;align-items:center;justify-content:center;will-change:transform,opacity;border:3px solid #fff;`
    if (opts.imageUrl) {
        const img = document.createElement('img')
        img.src = opts.imageUrl
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;'
        img.onerror = () => { img.remove() }
        el.appendChild(img)
    }
    document.body.appendChild(el)

    // trajetória em arco: sobe um pouco e cai no carrinho
    const mx = sx + (tx - sx) * 0.45
    const my = Math.max(28, Math.min(sy, ty) + Math.abs(sy - ty) * 0.25 - 40) // o arco nunca sai da tela
    const anim = el.animate([
        { transform: `translate(${sx}px, ${sy}px) scale(1)`, opacity: 0.95, offset: 0 },
        { transform: `translate(${mx}px, ${my}px) scale(0.85)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.28)`, opacity: 0.85, offset: 1 },
    ], { duration: 820, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' })
    await anim.finished.catch(() => {})
    el.remove()
    bump(target)
}
