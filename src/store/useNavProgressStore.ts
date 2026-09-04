// src/store/useNavProgressStore.ts
'use client'

import { create } from 'zustand'

interface NavProgressState {
    isNavigating: boolean
    start: () => void
    done: () => void
}

// Estado global simples pra mostrar uma reação imediata ao clicar em algo
// que navega pra outra página, enquanto a rota nova ainda está carregando.
export const useNavProgressStore = create<NavProgressState>((set) => ({
    isNavigating: false,
    start: () => set({ isNavigating: true }),
    done: () => set({ isNavigating: false }),
}))
