// src/lib/shellBar.ts — uma página de endereço DINÂMICO pede a barra de baixo (ex.: a página do veículo /<@>-<modelo>, que a lista fixa de
// páginas com barra não reconhece). A página liga ao abrir e desliga ao sair.
import { useSyncExternalStore } from 'react'

let on = false
const subs = new Set<() => void>()

export function setShellBar(next: boolean) {
    if (on === next) return
    on = next
    subs.forEach((f) => f())
}

export function useShellBar(): boolean {
    return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => on, () => false)
}
