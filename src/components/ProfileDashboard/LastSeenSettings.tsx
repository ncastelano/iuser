// Configuração "Visto por último": cada pessoa escolhe quem pode ver quando ela esteve online.
'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import DashboardSection from './DashboardSection'

type Visibility = 'all' | 'following' | 'none'

const OPTIONS: { value: Visibility; title: string; text: string }[] = [
    { value: 'all', title: 'Todo mundo', text: 'Qualquer pessoa vê "Online agora" ou "Visto hoje às 14:30" no seu perfil e no Social.' },
    { value: 'following', title: 'Só quem eu sigo', text: 'Apenas as pessoas que você segue veem quando você esteve online.' },
    { value: 'none', title: 'Ninguém', text: 'Ninguém vê quando você esteve online (só você).' },
]

export default function LastSeenSettings({ userId }: { userId: string }) {
    const { colors } = useTheme()
    const [value, setValue] = useState<Visibility>('following')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        supabase.from('profile_presence').select('visibility').eq('profile_id', userId).maybeSingle()
            .then(({ data }) => { if (data?.visibility) setValue(data.visibility as Visibility) })
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

    const label = OPTIONS.find((o) => o.value === value)?.title
    return (
        <DashboardSection storageKey="config-last-seen" title="Visto por último" subtitle={`Quem vê quando você esteve online · ${label}`}>
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
