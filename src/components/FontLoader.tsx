'use client'

import { useEffect } from 'react'
import { useFontStore } from '@/store/useFontStore'

export function FontLoader() {
    const { fontSize } = useFontStore()

    useEffect(() => {
        const html = document.documentElement
        
        // Remove classes antigas
        html.classList.remove('font-scale-normal', 'font-scale-large', 'font-scale-extra-large')
        
        // Adiciona a nova classe
        html.classList.add(`font-scale-${fontSize}`)
        
        // Aplica o base font-size no HTML para o Tailwind escalar os rems
        if (fontSize === 'normal') {
            html.style.fontSize = '16px'
        } else if (fontSize === 'large') {
            html.style.fontSize = '18px'
        } else if (fontSize === 'extra-large') {
            html.style.fontSize = '20px'
        }
    }, [fontSize])

    return null
}
