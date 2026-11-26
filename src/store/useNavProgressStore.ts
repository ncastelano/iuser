// src/store/useNavProgressStore.ts
'use client'

import { create } from 'zustand'

interface NavProgressState {
    /** navegação em andamento (clique que troca de página) */
    isNavigating: boolean
    /** quantas telas ainda estão CARREGANDO os próprios dados (usePageLoadBar); a barra segue até todas terminarem */
    loadingCount: number
    start: () => void
    done: () => void
    loadStart: () => void
    loadEnd: () => void
}

// Estado global da barrinha de progresso no topo: a navegação (clique) e o carregamento dos dados da própria tela.
export const useNavProgressStore = create<NavProgressState>((set) => ({
    isNavigating: false,
    loadingCount: 0,
    start: () => set({ isNavigating: true }),
    done: () => set({ isNavigating: false }),
    loadStart: () => set((s) => ({ loadingCount: s.loadingCount + 1 })),
    loadEnd: () => set((s) => ({ loadingCount: Math.max(0, s.loadingCount - 1) })),
}))
