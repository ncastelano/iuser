// Configuração "Visto por último": cada pessoa escolhe quem pode ver quando ela esteve online.
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import DashboardSection from './DashboardSection'

type Visibility = 'all' | 'following' | 'none'
type Mode = 'auto' | 'online' | 'offline'

const MODES: { value: Mode; title: string; text: string }[] = [
    { value: 'auto', title: 'Automático', text: 'Fica online quando você entra no app e offline quando sai.' },
    { value: 'online', title: 'Sempre online', text: 'Aparece online mesmo com o app em segundo plano.' },
    { value: 'offline', title: 'Offline', text: 'Aparece offline mesmo com o app aberto (ninguém vê que você esteve online).' },
]

const OPTIONS: { value: Visibility; title: string; text: string }[] = [
    { value: 'all', title: 'Todo mundo', text: 'Qualquer pessoa vê "Online agora" ou "Visto hoje às 14:30" no seu perfil e no Social.' },
    { value: 'following', title: 'Só quem eu sigo', text: 'Apenas as pessoas que você segue veem quando você esteve online.' },
    { value: 'none', title: 'Ninguém', text: 'Ninguém vê quando você esteve online (só você).' },
]

export default function LastSeenSettings({ userId }: { userId: string }) {
    const { colors } = useTheme()
    const [value, setValue] = useState<Visibility>('none')
    const [saving, setSaving] = useState(false)
    const [mode, setMode] = useState<Mode>('auto')

    useEffect(() => {
        supabase.from('profile_presence').select('visibility, mode').eq('profile_id', userId).maybeSingle()
            .then(({ data }) => { if (data?.visibility) setValue(data.visibility as Visibility); if (data?.mode) setMode(data.mode as Mode) })
    }, [userId])

    const choose = async (next: Visibility) => {
        if (next === value || saving) return
        const prev = value
        setValue(next)
        setSaving(true)
        const { error } = await supabase.rpc('set_last_seen_visibility', { p_value: next })
        setSaving(false)
        if (error) { setValue(prev); toast.error(error.message); return }
        toast.success('Preferência salva')
    }

    const chooseMode = async (next: Mode) => {
        if (next === mode || saving) return
        const prev = mode
        setMode(next)
        setSaving(true)
        const { error } = await supabase.rpc('set_presence_mode', { p_mode: next })
        setSaving(false)
        if (error) { setMode(prev); toast.error(error.message); return }
        window.dispatchEvent(new CustomEvent('iuser:presence-mode', { detail: next }))
        toast.success(next === 'offline' ? 'Você aparece offline' : next === 'online' ? 'Você fica sempre online' : 'Status automático')
    }

    const label = OPTIONS.find((o) => o.value === value)?.title
    return (
        <DashboardSection storageKey="config-last-seen" title="Status e visto por último" subtitle={`${MODES.find((m) => m.value === mode)?.title} · quem vê: ${label}`}>
            <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Meu status</p>
            <div className="grid grid-cols-3 gap-2">
                {MODES.map((m) => {
                    const active = m.value === mode
                    return (
                        <button
                            key={m.value}
                            onClick={() => chooseMode(m.value)}
                            disabled={saving}
                            title={m.text}
                            className="flex flex-col items-center gap-1 py-3 px-2 rounded-2xl text-center transition-all disabled:opacity-70"
                            style={{ border: `2px solid ${active ? '#f97316' : colors.border}`, background: active ? '#f9731612' : 'transparent' }}
                        >
                            <span className="w-3 h-3 rounded-full" style={{ background: m.value === 'offline' ? '#94a3b8' : '#22c55e' }} />
                            <span className="text-xs font-black" style={{ color: colors.textPrimary }}>{m.title}</span>
                        </button>
                    )
                })}
            </div>
            <p className="text-xs" style={{ color: colors.textSecondary }}>{MODES.find((m) => m.value === mode)?.text}</p>

            <p className="text-xs font-black uppercase tracking-wider mt-2" style={{ color: colors.textSecondary }}>Quem vê o meu status</p>
            <div className="flex flex-col gap-2">
                {OPTIONS.map((o) => {
                    const active = o.value === value
                    return (
                        <button
                            key={o.value}
                            onClick={() => choose(o.value)}
                            disabled={saving}
                            className="w-full flex items-start gap-3 p-3 rounded-2xl text-left transition-all disabled:opacity-70"
                            style={{ border: `2px solid ${active ? '#f97316' : colors.border}`, background: active ? '#f9731612' : 'transparent' }}
                        >
                            <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: `2px solid ${active ? '#f97316' : colors.border}` }}>
                                {active && <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#f97316' }} />}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-black" style={{ color: colors.textPrimary }}>{o.title}</span>
                                <span className="block text-xs mt-0.5" style={{ color: colors.textSecondary }}>{o.text}</span>
                            </span>
                        </button>
                    )
                })}
            </div>
        </DashboardSection>
    )
}
