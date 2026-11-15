// src/lib/bodyScrollLock.ts — trava a rolagem da página enquanto um diálogo/menu está aberto, com CONTADOR.
// Antes cada tela guardava o `overflow` anterior e o restaurava ao fechar; com dois travamentos sobrepostos (ex.: o menu da barra aberto + uma janela
// por cima) o que fechasse por último "restaurava" o `hidden` do outro e a página ficava SEM ROLAR para sempre. Agora só o último a sair solta.
// Use: const unlock = lockBodyScroll(); ... return () => unlock()   (chamar unlock duas vezes não faz mal)

let locks = 0
let saved = ''

export function lockBodyScroll(): () => void {
    if (typeof document === 'undefined') return () => {}
    if (locks === 0) {
        saved = document.body.style.overflow
        document.body.style.overflow = 'hidden'
    }
    locks++
    let released = false
    return () => {
        if (released) return
        released = true
        locks = Math.max(0, locks - 1)
        if (locks === 0) document.body.style.overflow = saved
    }
}

/** só para teste */
export function __lockCount(): number { return locks }
