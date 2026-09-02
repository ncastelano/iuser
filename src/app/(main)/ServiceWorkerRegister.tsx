// src/components/ServiceWorkerRegister.tsx
'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegister() {
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('✅ SW registrado:', registration)
                })
                .catch(error => {
                    console.error('❌ Erro ao registrar SW:', error)
                })
        }
    }, [])

    return null
}