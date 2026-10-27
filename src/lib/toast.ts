// src/lib/toast.ts
//
// AVISOS do app (o que antes era o "snackbar" branco do sonner embaixo da tela). Mesma API de `toast` do sonner — `toast.success/error/info/message(texto, { description, duration, icon, id })`,
// `toast(texto)`, `toast.custom(id => <JSX/>)` e `toast.dismiss(id?)` — mas NÃO desenha nada sozinho: a mensagem vai para uma fila e quem a mostra é a ILHA do topo (3.0), que por esse
// momento vira o "mensageiro" do aviso (cor e ícone do tipo, volta ao normal quando acaba o tempo). Onde não há ilha (2.0, páginas fora da casca) o `IslandToastFallback` mostra a mesma
// mensagem numa pílula no topo. Não importe `sonner` em código novo: use sempre este módulo.
'use client'

import { useSyncExternalStore, type ReactNode } from 'react'

export type ToastKind = 'success' | 'error' | 'info' | 'message'
export interface ToastAction { label: string; onClick: () => void }
/** `style`, `className` e `icon` em JSX são aceitos (compatibilidade com o sonner) mas ignorados: a ilha usa a cor e o símbolo do tipo */
export interface ToastOptions { description?: ReactNode; duration?: number; icon?: ReactNode; id?: string | number; action?: ToastAction; style?: unknown; className?: string; position?: string }
export interface IslandMessage { id: string | number; kind: ToastKind; text: string; description?: string; icon?: string; action?: ToastAction; duration: number; custom?: (id: string | number) => ReactNode }

const MAX_QUEUE = 5
let queue: IslandMessage[] = []
let consumers = 0
let seq = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

const asText = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : v == null ? '' : (v as any)?.props?.children ? String((v as any).props.children) : String(v))
const DEFAULT_MS: Record<ToastKind, number> = { success: 3600, info: 4600, message: 4200, error: 5600 }

function push(kind: ToastKind, text: unknown, opts?: ToastOptions): string | number {
    const id = opts?.id ?? `t${seq++}`
    const msg: IslandMessage = { id, kind, text: asText(text), description: opts?.description ? asText(opts.description) : undefined, icon: typeof opts?.icon === 'string' ? opts.icon : undefined, action: opts?.action, duration: opts?.duration ?? (opts?.action ? 8000 : DEFAULT_MS[kind]) }
    queue = [...queue.filter((m) => m.id !== id), msg].slice(-MAX_QUEUE)
    emit()
    return id
}

type ToastFn = ((text: unknown, opts?: ToastOptions) => string | number) & {
    success: (text: unknown, opts?: ToastOptions) => string | number
    error: (text: unknown, opts?: ToastOptions) => string | number
    info: (text: unknown, opts?: ToastOptions) => string | number
    warning: (text: unknown, opts?: ToastOptions) => string | number
    message: (text: unknown, opts?: ToastOptions) => string | number
    /** cartão próprio (ex.: alerta de corrida com botões): a ilha avisa e o cartão abre logo abaixo dela */
    custom: (render: (id: string | number) => ReactNode, opts?: ToastOptions & { title?: string }) => string | number
    dismiss: (id?: string | number) => void
}

export const toast: ToastFn = Object.assign(
    (text: unknown, opts?: ToastOptions) => push('message', text, opts),
    {
        success: (text: unknown, opts?: ToastOptions) => push('success', text, opts),
        error: (text: unknown, opts?: ToastOptions) => push('error', text, opts),
        info: (text: unknown, opts?: ToastOptions) => push('info', text, opts),
        warning: (text: unknown, opts?: ToastOptions) => push('info', text, opts),
        message: (text: unknown, opts?: ToastOptions) => push('message', text, opts),
        custom: (render: (id: string | number) => ReactNode, opts?: ToastOptions & { title?: string }) => {
            const id = opts?.id ?? `t${seq++}`
            queue = [...queue.filter((m) => m.id !== id), { id, kind: 'message' as ToastKind, text: opts?.title || 'Novo aviso', icon: typeof opts?.icon === 'string' ? opts.icon : '🔔', duration: opts?.duration ?? 20000, custom: render }].slice(-MAX_QUEUE)
            emit()
            return id
        },
        dismiss: (id?: string | number) => { queue = id == null ? [] : queue.filter((m) => m.id !== id); emit() },
    },
)

/** A mensagem da vez (a mais antiga da fila) e quantas esperam */
export function useIslandMessage(): { msg: IslandMessage | null; waiting: number } {
    const snap = useSyncExternalStore(subscribe, () => queue, () => queue)
    return { msg: snap[0] || null, waiting: Math.max(0, snap.length - 1) }
}

/** Quem tem uma ilha (a casca da 3.0) se registra: enquanto houver ilha, o fallback em pílula fica quieto */
export function registerIslandConsumer() { consumers++; emit(); return () => { consumers--; emit() } }
export function useHasIsland(): boolean { return useSyncExternalStore(subscribe, () => consumers > 0, () => false) }

// depuração em desenvolvimento: no console, `__toast.success('oi')`
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') (window as unknown as { __toast?: ToastFn }).__toast = toast
