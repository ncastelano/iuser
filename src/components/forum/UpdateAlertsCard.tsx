// Interruptor "Avisar fora do iUser": liga/desliga as novidades na barra do aparelho (push).
// Ligar pede a permissão de notificação deste aparelho (se ainda não tem); desligar só grava a preferência.
// O envio é feito pelo servidor (admin → Fórum → Avisar todo mundo) e respeita este interruptor.
'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { usePushNotifications } from '@/hooks/usePushNotifications'

export default function UpdateAlertsCard({ colors, card }: { colors: any; card: React.CSSProperties }) {
    const { subscribe, isSupported } = usePushNotifications()
    const [on, setOn] = useState<boolean | null>(null)
    const [busy, setBusy] = useState(false)
    // ligado de verdade = a preferência está ligada E este aparelho tem a notificação registrada
    const [device, setDevice] = useState<boolean | null>(null)

    useEffect(() => {
        let live = true
        supabase.rpc('get_update_notifications').then(({ data, error }) => {
            if (!live) return
            setOn(error ? false : data !== false)
        })
        return () => { live = false }
    }, [])

    useEffect(() => {
        let live = true
        if (!isSupported || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) { setDevice(false); return }
        navigator.serviceWorker.getRegistration('/sw.js').then(async (reg) => {
            const sub = reg ? await reg.pushManager.getSubscription() : null
            if (live) setDevice(!!sub && Notification.permission === 'granted')
        }).catch(() => { if (live) setDevice(false) })
        return () => { live = false }
    }, [isSupported])

    const toggle = async () => {
        if (on === null || busy) return
        const next = !shown
        setBusy(true)
        try {
            if (next) {
                const ok = await subscribe()
                if (!ok) {
                    toast.error('Libere as notificações deste aparelho', { description: 'Permita as notificações para receber as novidades fora do iUser.' })
                    return
                }
            }
            const { data, error } = await supabase.rpc('set_update_notifications', { p_enabled: next })
            if (error) { toast.error('Não foi possível salvar'); return }
            setOn(data !== false)
            if (next) setDevice(true)
            toast.success(next ? 'Você vai receber as novidades' : 'Novidades desligadas')
        } finally {
            setBusy(false)
        }
    }

    const shown = !!on && device === true
    const Icon = shown ? Bell : BellOff
    return (
        <div style={card} className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: shown ? '#f9731620' : `${colors.border}55`, color: shown ? '#f97316' : colors.textSecondary }}>
                <Icon size={18} />
            </span>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Avisar fora do iUser</p>
                <p className="text-xs leading-snug" style={{ color: colors.textSecondary }}>
                    {!isSupported
                        ? 'Este aparelho não recebe avisos pelo navegador. Pelo app instalado, o aviso chega na barra do celular.'
                        : shown
                            ? 'Quando sair uma versão nova, o aviso chega na barra do aparelho, mesmo com o iUser fechado.'
                            : 'Ligue para saber das novidades pela barra do aparelho, mesmo com o iUser fechado.'}
                </p>
            </div>
            <button
                onClick={toggle}
                disabled={on === null || device === null || busy || !isSupported}
                role="switch"
                aria-checked={shown}
                aria-label="Avisar fora do iUser quando sair novidade"
                className="relative w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
                style={{ background: shown ? '#f97316' : `${colors.border}90` }}
            >
                <span className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all" style={{ left: shown ? '22px' : '2px' }} />
            </button>
        </div>
    )
}
