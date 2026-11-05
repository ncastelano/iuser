// src/versions/v3/bar/kind.tsx — o TIPO da barra (pessoa, loja ou motorista) que a casca decidiu, para as telas de dentro saberem em que modo estão
'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { BarKind } from './domain'

const Ctx = createContext<BarKind>('pessoa')

export function BarKindProvider({ kind, children }: { kind: BarKind; children: ReactNode }) {
    return <Ctx.Provider value={kind}>{children}</Ctx.Provider>
}

export const useBarKind = (): BarKind => useContext(Ctx)
