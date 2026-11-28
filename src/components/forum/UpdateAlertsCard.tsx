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

    // Interruptor: ligar pede a permissão do aparelho quando ele ainda não recebe; desligar só troca a preferência.
    const toggle = async () => {
        if (on === null || busy) return
        setBusy(true)
        try {
            const next = !on
            if (next && device !== true) {
                const ok = await subscribe()
                if (!ok) { toast.error('Libere as notificações deste aparelho', { description: 'Permita as notificações para receber as novidades fora do iUser.' }); return }
                setDevice(true)
            }
            if (await saveOn(next)) toast.success(next ? 'Você vai receber as novidades' : 'Novidades desligadas')
        } finally {
            setBusy(false)
        }
    }

    const Icon = on ? Bell : BellOff
    const ORANGE = '#f97316'
    const text = !isSupported
        ? 'Este aparelho não recebe avisos pelo navegador. Pelo app instalado, o aviso chega na barra do celular.'
        : on && device === false
            ? 'Ligado, mas este aparelho ainda não recebe avisos.'
            : on
                ? 'O aviso chega na barra do aparelho quando sair uma versão nova, mesmo com o iUser fechado.'
                : 'Ligue para saber das novidades pela barra do aparelho, mesmo com o iUser fechado.'
    return (
        <section className="rounded-3xl p-4" style={{ ...card, boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
            <div className="flex items-start gap-3">
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: on ? `${ORANGE}1f` : `${colors.border}55`, color: on ? ORANGE : colors.textSecondary }}>
                    <Icon size={20} />
                </span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[14.5px] font-black leading-tight" style={{ color: colors.textPrimary }}>Avisar fora do iUser</p>
                        <span className="px-2 h-5 rounded-full text-[10.5px] font-black inline-flex items-center"
                            style={{ background: on ? `${ORANGE}1f` : `${colors.border}66`, color: on ? ORANGE : colors.textSecondary }}>
                            {on === null ? '…' : on ? 'Ligado' : 'Desligado'}
                        </span>
                    </div>
                    <p className="text-[12.5px] mt-1 leading-snug" style={{ color: colors.textSecondary }}>{text}</p>
                </div>
                <button
                    onClick={toggle}
                    disabled={on === null || device === null || busy || !isSupported}
                    role="switch"
                    aria-checked={!!on}
                    aria-label="Avisar fora do iUser quando sair novidade"
                    className="relative w-[52px] h-[30px] rounded-full flex-shrink-0 transition-colors duration-200 disabled:opacity-50 active:scale-95"
                    style={{ background: on ? ORANGE : `${colors.border}aa` }}
                >
                    <span className="absolute top-[3px] w-6 h-6 rounded-full bg-white transition-all duration-200" style={{ left: on ? '25px' : '3px', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
                </button>
            </div>
        </section>
    )
}
