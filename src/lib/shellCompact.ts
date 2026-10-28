// src/lib/shellCompact.ts
//
// Páginas de TRABALHO (ex.: o Percurso do motorista) pedem à casca da 3.0 uma ilha FINA: uma linha com o rótulo da página, sem a sacola, os pedidos e o cumprimento
// (o espaço de cima é do mapa). A ilha volta ao normal quando a página sai. Os avisos do sistema (toast) continuam aparecendo nela. `null` = ilha normal.
import { useSyncExternalStore } from 'react'

let label: string | null = null
const subs = new Set<() => void>()

export function setShellCompact(next: string | null) {
    if (label === next) return
    label = next
    subs.forEach((f) => f())
}

export function useShellCompact(): string | null {
    return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb) } }, () => label, () => null)
}
