// src/lib/driverMode.ts — avisa o app inteiro, na hora, que o MODO MOTORISTA foi ligado ou desligado nesta aba (o painel do motorista chama `announceDriverMode`).
// Quem escuta (hoje o aviso global de corrida nova, `DriverRideAlertListener`) liga ou desliga na hora, sem esperar trocar de página: desligado = nenhum cartão de corrida aparece.
'use client'

export const DRIVER_MODE_EVENT = 'iuser-driver-mode'

export function announceDriverMode(active: boolean) {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(DRIVER_MODE_EVENT, { detail: { active } }))
}

export function onDriverMode(fn: (active: boolean) => void): () => void {
    if (typeof window === 'undefined') return () => {}
    const h = (e: Event) => fn(!!(e as CustomEvent<{ active: boolean }>).detail?.active)
    window.addEventListener(DRIVER_MODE_EVENT, h)
    return () => window.removeEventListener(DRIVER_MODE_EVENT, h)
}
