// "Adicionar" do painel do perfil: ao escolher Publicação ou Serviço, a tela rola suave até o componente e um "bot"
// (uma bolinha com brilho) sai do botão e voa até ele; quando chega, o componente abre sozinho e já mostra o formulário.
// Os componentes (Minhas Publicações / Meus Serviços) marcam a raiz com data-add-target e escutam 'iuser:add-open'.
export type AddKind = 'publication' | 'service'

export const ADD_OPEN_EVENT = 'iuser:add-open'

const waitForScrollEnd = (timeout = 1200) => new Promise<void>((resolve) => {
    let last = window.scrollY
    let stable = 0
    const started = performance.now()
    const tick = () => {
        const now = window.scrollY
        stable = Math.abs(now - last) < 1 ? stable + 1 : 0
        last = now
        if (stable >= 6 || performance.now() - started > timeout) resolve()
        else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
})

export async function launchAddBot(kind: AddKind, fromEl: HTMLElement | null) {
    const target = document.querySelector<HTMLElement>(`[data-add-target="${kind}"]`)
    if (!target) return

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const open = () => window.dispatchEvent(new CustomEvent(ADD_OPEN_EVENT, { detail: kind }))

    // 1) o componente abre (se estiver fechado) já no começo, pra a rolagem chegar no tamanho final
    window.dispatchEvent(new CustomEvent(ADD_OPEN_EVENT, { detail: `${kind}:expand` }))

    // 2) rola suave até ele (deixa espaço pro cabeçalho fixo)
    const top = target.getBoundingClientRect().top + window.scrollY - 150
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' })

    if (reduce || !fromEl) { setTimeout(open, 250); return }

    // 3) o bot: nasce no botão, espera a rolagem acabar e voa até o título do componente
    const from = fromEl.getBoundingClientRect()
    const orb = document.createElement('div')
    const size = 30
    orb.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;border-radius:9999px;z-index:9999;pointer-events:none;
        background:radial-gradient(circle at 35% 30%, #fde68a, #f97316 55%, #dc2626);box-shadow:0 0 18px 6px rgba(249,115,22,.65);`
    const sx = from.left + from.width / 2 - size / 2
    const sy = from.top + from.height / 2 - size / 2
    orb.style.transform = `translate(${sx}px, ${sy}px) scale(.4)`
    document.body.appendChild(orb)
    const appear = orb.animate(
        [{ transform: `translate(${sx}px, ${sy}px) scale(.4)`, opacity: 0 }, { transform: `translate(${sx}px, ${sy - 14}px) scale(1)`, opacity: 1 }],
        { duration: 260, easing: 'ease-out', fill: 'forwards' }
    )
    await appear.finished.catch(() => {})
    await waitForScrollEnd()

    const t = target.getBoundingClientRect()
    const ex = Math.min(Math.max(t.left + 44, 8), window.innerWidth - size - 8)
    const ey = Math.min(Math.max(t.top + 38, 90), window.innerHeight - size - 8)
    // um arco suave (sobe um pouco antes de descer no alvo)
    const mx = (sx + ex) / 2
    const my = Math.min(sy, ey) - 50
    const flight = orb.animate(
        [
            { transform: `translate(${sx}px, ${sy - 14}px) scale(1)`, opacity: 1 },
            { transform: `translate(${mx}px, ${my}px) scale(1.25)`, opacity: 1, offset: 0.5 },
            { transform: `translate(${ex}px, ${ey}px) scale(.8)`, opacity: 1, offset: 0.92 },
            { transform: `translate(${ex}px, ${ey}px) scale(2.6)`, opacity: 0 },
        ],
        { duration: 900, easing: 'cubic-bezier(.22,.8,.3,1)', fill: 'forwards' }
    )
    await flight.finished.catch(() => {})
    orb.remove()

    // 4) o componente "recebe" o bot: brilho rápido e o formulário abre
    target.animate(
        [{ boxShadow: '0 0 0 0 rgba(249,115,22,0)' }, { boxShadow: '0 0 0 6px rgba(249,115,22,.45), 0 0 36px rgba(249,115,22,.55)' }, { boxShadow: '0 0 0 0 rgba(249,115,22,0)' }],
        { duration: 1100, easing: 'ease-out' }
    )
    open()
}
