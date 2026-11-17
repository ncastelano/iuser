// src/components/profile/ProfileTypeEditor.tsx
//
// Trocar o TIPO DO PERFIL no painel do perfil (Pessoal, Serviços, Agendamentos, Motorista). Carrega e salva sozinho (`profiles.profile_type`)
// e diz o que falta para o tipo escolhido funcionar (ligar a agenda, cadastrar o veículo, publicar um serviço), com o atalho.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, LayoutTemplate } from 'lucide-react'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase/client'
import { saveOwnProfile } from '@/lib/saveOwnProfile'
import { useTheme } from '@/app/contexts/theme'
import ProfileTypePicker from './ProfileTypePicker'
import { parseProfileType, profileTypeInfo, profileTypeMissing, type ProfileType } from '@/lib/profileType'

const MISSING = {
    agenda: { text: 'A sua agenda está desligada: ninguém consegue agendar ainda.', cta: 'Ligar a agenda', path: '/compromissos?tab=agenda-perfil' },
    vehicle: { text: 'Cadastre o seu veículo para aparecer o botão "Solicitar corrida".', cta: 'Cadastrar veículo', path: '/canal-do-motorista?aba=veiculo' },
    service: { text: 'Publique um serviço para os clientes verem o que você faz.', cta: 'Publicar serviço', path: '/meus-servicos' },
} as const

export default function ProfileTypeEditor({ userId, profileSlug }: { userId: string; profileSlug?: string | null }) {
    const router = useRouter()
    const { colors } = useTheme()
    const [saved, setSaved] = useState<ProfileType | null>(null)
    const [type, setType] = useState<ProfileType>('pessoal')
    const [saving, setSaving] = useState(false)
    const [facts, setFacts] = useState({ allowScheduling: false, hasVehicle: false, services: 0 })

    useEffect(() => {
        let alive = true
        void (async () => {
            const [{ data: p }, { count: veh }, { count: svc }] = await Promise.all([
                supabase.from('profiles').select('profile_type, allow_scheduling').eq('id', userId).maybeSingle(),
                supabase.from('driver_vehicles').select('id', { count: 'exact', head: true }).eq('driver_id', userId),
                supabase.from('products').select('id', { count: 'exact', head: true }).eq('owner_id', userId).is('store_id', null).eq('listing_type', 'service_offer'),
            ])
            if (!alive) return
            const t = parseProfileType((p as any)?.profile_type)
            setSaved(t); setType(t)
            setFacts({ allowScheduling: !!(p as any)?.allow_scheduling, hasVehicle: (veh || 0) > 0, services: svc || 0 })
        })()
        return () => { alive = false }
    }, [userId])

    if (saved === null) return null
    const save = async () => {
        setSaving(true)
        const { error } = await saveOwnProfile(supabase, userId, { profile_type: type })
        setSaving(false)
        if (error) { toast.error('Não deu para salvar o tipo do perfil: ' + error.message); return }
        setSaved(type)
        toast.success(`Perfil agora é do tipo ${profileTypeInfo(type).title}`, profileSlug ? { action: { label: 'Ver perfil', onClick: () => router.push(`/${profileSlug}`) } } : undefined)
    }
    const missing = profileTypeMissing(saved, facts)
    return (
        <section className="rounded-3xl p-4 space-y-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${profileTypeInfo(saved).color}1f`, color: profileTypeInfo(saved).color }}><LayoutTemplate size={19} /></span>
                <div className="min-w-0">
                    <h3 className="text-[15px] font-black leading-tight" style={{ color: colors.textPrimary }}>Tipo do perfil</h3>
                    <p className="text-[12px] leading-snug mt-0.5" style={{ color: colors.textSecondary }}>Muda o botão principal e o que aparece primeiro na sua página. Hoje: <b style={{ color: profileTypeInfo(saved).color }}>{profileTypeInfo(saved).title}</b>.</p>
                </div>
            </div>
            {missing && (
                <button onClick={() => router.push(MISSING[missing].path)} className="w-full rounded-2xl p-3 flex items-center gap-2 text-left" style={{ background: '#f59e0b1a', border: '1px solid #f59e0b66' }}>
                    <span className="min-w-0 flex-1 text-[12px] font-bold leading-snug" style={{ color: colors.textPrimary }}>{MISSING[missing].text}</span>
                    <span className="flex items-center text-[12px] font-black flex-shrink-0" style={{ color: '#b45309' }}>{MISSING[missing].cta}<ChevronRight size={14} /></span>
                </button>
            )}
            <ProfileTypePicker value={type} onChange={setType} colors={colors} />
            {type !== saved && (
                <button type="button" onClick={save} disabled={saving} className="w-full h-11 rounded-full text-[13px] font-black text-white disabled:opacity-50" style={{ background: profileTypeInfo(type).color }}>
                    {saving ? 'Salvando...' : `Usar o tipo ${profileTypeInfo(type).title}`}
                </button>
            )}
        </section>
    )
}
