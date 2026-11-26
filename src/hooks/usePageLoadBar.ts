// src/hooks/usePageLoadBar.ts — a barrinha de progresso do topo acompanha o CARREGAMENTO da tela: enquanto `loading` é true
// (dados da página ainda chegando), a barra segue; quando termina, ela completa e some. Use em toda tela que carrega dados.
'use client'

import { useEffect } from 'react'
import { useNavProgressStore } from '@/store/useNavProgressStore'

export function usePageLoadBar(loading: boolean) {
    useEffect(() => {
        if (!loading) return
        const { loadStart, loadEnd } = useNavProgressStore.getState()
        loadStart()
        return () => loadEnd()
    }, [loading])
}
