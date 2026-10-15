// src/components/InsideShell.tsx
//
// Diz aos componentes compartilhados (ex.: Header) que estão dentro da casca da interface 3.0 — onde a navbar e o
// menu já existem — pra se apresentarem de forma compacta, sem duplicar o cabeçalho da 2.0.
'use client'

import { createContext, useContext } from 'react'

export const InsideShellContext = createContext(false)
export const useInsideShell = () => useContext(InsideShellContext)
