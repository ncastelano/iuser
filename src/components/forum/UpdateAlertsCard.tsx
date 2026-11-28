// Interruptor "Avisar fora do iUser": liga/desliga as novidades na barra do aparelho (push).
// Começa LIGADO para quem já aceitou as notificações do iUser (sem preferência gravada = ligado) e só desliga se a pessoa quiser.
// O interruptor mostra a PREFERÊNCIA da pessoa. Se este aparelho ainda não recebe (ex.: notificação não liberada aqui), aparece um
// aviso e o toque libera o aparelho sem mudar a preferência.
'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { usePushNotifications } from '@/hooks/usePushNotifications'

export default function UpdateAlertsCard({ colors, card }: { colors: any; card: React.CSSProperties }) {
    const { subscribe, isSupported } = usePushNotifications()
    const [on, setOn] = useState<boolean | null>(null)     // preferência da pessoa (padrão: ligado)
    const [device, setDevice] = useState<boolean | null>(null) // este aparelho recebe o aviso?
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        let live = true
        supabase.rpc('get_update_notifications').then(({ data, error }) => {
            if (live) setOn(error ? true : data !== false)
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

    const saveOn = async (next: boolean) => {
        const { data, error } = await supabase.rpc('set_update_notifications', { p_enabled: next })
        if (error) { toast.error('Não foi possível salvar'); return false }
        setOn(data !== false)
        return true
    }

    // Toque: se este aparelho não recebe, libera o aparelho (e liga); se recebe, troca a preferência.
    const toggle = async () => {
        if (on === null || busy) return
        setBusy(true)
        try {
            if (device !== true) {
                const ok = await subscribe()
                if (!ok) { toast.error('Libere as notificações deste aparelho', { description: 'Permita as notificações para receber as novidades fora do iUser.' }); return }
                setDevice(true)
                if (await saveOn(true)) toast.success('Este aparelho vai receber as novidades')
                return
            }
            const next = !on
            if (await saveOn(next)) toast.success(next ? 'Você vai receber as novidades' : 'Novidades desligadas')
        } finally {
            setBusy(false)
        }
    }

    const Icon = on ? Bell : BellOff
    const text = !isSupported
        ? 'Este aparelho não recebe avisos pelo navegador. Pelo app instalado, o aviso chega na barra do celular.'
        : on && device === false
            ? 'Ligado, mas este aparelho ainda não recebe avisos. Toque para liberar aqui.'
            : on
                ? 'Quando sair uma versão nova, o aviso chega na barra do aparelho, mesmo com o iUser fechado.'
                : 'Desligado. Ligue para saber das novidades pela barra do aparelho, mesmo com o iUser fechado.'
    return (
        <div style={card} className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: on ? '#f9731620' : `${colors.border}55`, color: on ? '#f97316' : colors.textSecondary }}>
                <Icon size={18} />
            </span>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Avisar fora do iUser</p>
                <p className="text-xs leading-snug" style={{ color: colors.textSecondary }}>{text}</p>
            </div>
            <button
                onClick={toggle}
                disabled={on === null || device === null || busy || !isSupported}
                role="switch"
                aria-checked={!!on}
                aria-label="Avisar fora do iUser quando sair novidade"
                className="relative w-12 h-7 rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
                style={{ background: on ? '#f97316' : `${colors.border}90` }}
            >
                <span className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all" style={{ left: on ? '22px' : '2px' }} />
            </button>
        </div>
    )
}
