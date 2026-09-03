'use client'

import { useEffect } from 'react'

const CLEANUP_FLAG = 'pwaCleanupV1Done'

export function PwaCleanup() {
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return
        if (localStorage.getItem(CLEANUP_FLAG)) return
        localStorage.setItem(CLEANUP_FLAG, '1')

        navigator.serviceWorker.getRegistrations()
            .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
            .catch((error) => {
                console.error('Erro ao remover service workers antigos:', error)
            })

        if ('caches' in window) {
            caches.keys()
                .then((cacheNames) => Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName))))
                .catch((error) => {
                    console.error('Erro ao limpar caches antigos do PWA:', error)
                })
        }
    }, [])

    return null
}
