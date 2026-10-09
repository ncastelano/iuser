// "Adicionar" do painel do perfil: ao escolher Publicação ou Serviço, a tela rola suave até o componente (só o movimento da
// câmera, sem bolinha nem brilho) e, quando a rolagem acaba, o componente abre já com o formulário.
// Os componentes (Minhas Publicações / Meus Serviços) marcam a raiz com data-add-target e escutam 'iuser:add-open'.
export type AddKind = 'publication' | 'service'

export const ADD_OPEN_EVENT = 'iuser:add-open'

const waitForScrollEnd = (timeout = 1400) => new Promise<void>((resolve) => {
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

export async function launchAddBot(kind: AddKind, _fromEl?: HTMLElement | null) {
    const target = document.querySelector<HTMLElement>(`[data-add-target="${kind}"]`)
    if (!target) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    // O componente abre (se estiver fechado) antes, pra a rolagem chegar no tamanho final
    window.dispatchEvent(new CustomEvent(ADD_OPEN_EVENT, { detail: `${kind}:expand` }))
    await new Promise((r) => setTimeout(r, 60))

    // Movimento de câmera suave até ele (deixa espaço pro cabeçalho fixo)
    const top = target.getBoundingClientRect().top + window.scrollY - 150
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' })
    await waitForScrollEnd()

    window.dispatchEvent(new CustomEvent(ADD_OPEN_EVENT, { detail: kind }))
}
