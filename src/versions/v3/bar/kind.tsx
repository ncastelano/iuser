// src/versions/v3/bar/kind.tsx — o TIPO da barra (pessoa, loja ou motorista) e a loja do modo, que a casca decidiu, para as telas de dentro saberem em que modo estão
'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { BarKind } from './domain'

interface Value { kind: BarKind; storeSlug: string | null }
const Ctx = createContext<Value>({ kind: 'pessoa', storeSlug: null })

export function BarKindProvider({ kind, storeSlug = null, children }: { kind: BarKind; storeSlug?: string | null; children: ReactNode }) {
    return <Ctx.Provider value={{ kind, storeSlug }}>{children}</Ctx.Provider>
}

export const useBarKind = (): BarKind => useContext(Ctx).kind
/** A loja do modo loja (null nos outros modos) */
export const useBarStore = (): string | null => useContext(Ctx).storeSlug
