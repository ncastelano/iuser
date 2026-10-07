// src/components/ProfileDashboard/AvatarBordersDialog.tsx
//
// "Bordas" em Informações do Perfil: as bordas de avatar que a pessoa tem (e qual está usando), as que
// dá pra resgatar agora e as que não estão disponíveis. Resgatar não troca a borda em uso: quem escolhe
// qual usar é a pessoa (só a "Eu sou brasileiro" entra sozinha quando se entra no Pré-pago no prazo).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { PlanRingFrame } from '@/components/PlanAvatarRing'
import { resetPlanRingCache } from '@/lib/planRing'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface BorderRow {
    id: string
    slug: string
    name: string
    description: string | null
    colors: string[]
    grant_mode: 'auto_prepaid' | 'claim' | 'admin_only'
    available_from: string | null
    available_until: string | null
    requires_prepaid: boolean
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

interface Props {
    profileId: string
    avatarUrl: string | null
    name: string
    onClose: () => void
    onChanged?: () => void
}

export default function AvatarBordersDialog({ profileId, avatarUrl, name, onClose, onChanged }: Props) {
    const { colors } = useTheme()
    const [loading, setLoading] = useState(true)
    const [borders, setBorders] = useState<BorderRow[]>([])
    const [owned, setOwned] = useState<Set<string>>(new Set())
    const [equipped, setEquipped] = useState<string | null>(null)
    const [hasPrepaid, setHasPrepaid] = useState(false)
    const [busy, setBusy] = useState<string | null>(null)

    const load = useCallback(async () => {
        const nowIso = new Date().toISOString()
        const [{ data: all }, { data: mine }, { data: prof }, { data: subs }] = await Promise.all([
            supabase.from('avatar_borders').select('id, slug, name, description, colors, grant_mode, available_from, available_until, requires_prepaid').eq('is_active', true).order('sort_order'),
            supabase.from('user_avatar_borders').select('border_id').eq('profile_id', profileId),
            supabase.from('profiles').select('avatar_border_id').eq('id', profileId).maybeSingle(),
            supabase.from('subscriptions').select('current_period_end, plans!inner(code)').eq('user_id', profileId).eq('status', 'active').eq('plans.code', 'pre_pago').gt('current_period_end', nowIso),
        ])
        setBorders((all as BorderRow[]) || [])
        setOwned(new Set((mine || []).map((r: any) => r.border_id)))
        setEquipped(prof?.avatar_border_id || null)
        setHasPrepaid((subs || []).length > 0)
        setLoading(false)
    }, [profileId])

    useEffect(() => { load() }, [load])

    const afterChange = async () => {
        resetPlanRingCache(profileId)
        await load()
        onChanged?.()
    }

    const equip = async (id: string | null) => {
        setBusy(id || 'none')
        const { error } = await supabase.rpc('equip_avatar_border', { p_border_id: id })
        setBusy(null)
        if (error) { toast.error(error.message); return }
        toast.success(id ? 'Borda em uso' : 'Borda removida')
        await afterChange()
    }

    const claim = async (b: BorderRow) => {
        setBusy(b.id)
        const { error } = await supabase.rpc('claim_avatar_border', { p_slug: b.slug })
        setBusy(null)
        if (error) { toast.error(error.message); return }
        toast.success(`Você resgatou "${b.name}"`)
        await afterChange()
    }

    const now = Date.now()
    const claimState = (b: BorderRow): { can: boolean; reason?: string } => {
        if (b.grant_mode === 'admin_only') return { can: false, reason: 'Só o administrador concede' }
        if (b.available_from && now < new Date(b.available_from).getTime()) return { can: false, reason: `Abre em ${fmtDate(b.available_from)}` }
        if (b.available_until && now > new Date(b.available_until).getTime()) return { can: false, reason: `Prazo encerrado em ${fmtDate(b.available_until)}` }
        if (b.requires_prepaid && !hasPrepaid) return { can: false, reason: 'Pra quem usa o plano Pré-pago' }
        return { can: true }
    }

    const avatar = (
        <span
            className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center font-black text-lg"
            style={{ background: '#e5e7eb', color: '#6b7280' }}
        >
            {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : (name || '?').charAt(0).toUpperCase()}
        </span>
    )

    const mine = borders.filter((b) => owned.has(b.id))
    const others = borders.filter((b) => !owned.has(b.id))

    const card = (b: BorderRow, isOwned: boolean) => {
        const active = equipped === b.id
        const cs = claimState(b)
        return (
            <div key={b.id} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: colors.surface, border: `1px solid ${active ? '#22c55e' : colors.border}` }}>
                <div className="flex-shrink-0 p-1.5">
                    <PlanRingFrame colors={b.colors} width={3}>{avatar}</PlanRingFrame>
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>
                        {b.name}
                        {active && <span className="ml-2 text-[9px] font-black uppercase px-2 py-0.5 rounded-full text-white align-middle" style={{ background: '#16a34a' }}>em uso</span>}
                    </p>
                    {b.description && <p className="text-[11px] leading-snug mt-0.5" style={{ color: colors.textSecondary }}>{b.description}</p>}
                    {!isOwned && !cs.can && cs.reason && <p className="text-[11px] mt-1 font-bold" style={{ color: '#ea580c' }}>{cs.reason}</p>}
                    {!isOwned && cs.can && b.available_until && <p className="text-[10px] mt-1" style={{ color: colors.textSecondary }}>Resgate até {fmtDate(b.available_until)}</p>}
                </div>
                <div className="flex-shrink-0">
                    {isOwned ? (
                        active ? (
                            <button onClick={() => equip(null)} disabled={busy !== null} className="px-3 py-2 rounded-full text-[11px] font-black" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                                {busy === 'none' ? <Spinner size={12} /> : 'Tirar'}
                            </button>
                        ) : (
                            <button onClick={() => equip(b.id)} disabled={busy !== null} className="px-4 py-2 rounded-full text-[11px] font-black text-white" style={{ background: GRADIENT }}>
                                {busy === b.id ? <Spinner size={12} color="#fff" /> : 'Usar'}
                            </button>
                        )
                    ) : cs.can ? (
                        <button onClick={() => claim(b)} disabled={busy !== null} className="px-4 py-2 rounded-full text-[11px] font-black text-white flex items-center gap-1" style={{ background: GRADIENT }}>
                            {busy === b.id ? <Spinner size={12} color="#fff" /> : <><Check size={12} /> Resgatar</>}
                        </button>
                    ) : null}
                </div>
            </div>
        )
    }

    return createPortal(
        <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
            <div
                className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-4"
                style={{ background: colors.background, border: `1px solid ${colors.border}` }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>Bordas</h3>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>As bordas da sua foto de perfil. Você escolhe qual usar.</p>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" style={{ color: colors.textSecondary }}><X size={20} /></button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-8"><Spinner size={22} color={colors.accent} /></div>
                ) : (
                    <>
                        <div className="flex flex-col gap-2">
                            <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Minhas bordas</p>
                            {mine.length === 0 ? (
                                <p className="text-xs" style={{ color: colors.textSecondary }}>Você ainda não tem nenhuma borda.</p>
                            ) : mine.map((b) => card(b, true))}
                        </div>
                        {others.length > 0 && (
                            <div className="flex flex-col gap-2">
                                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Outras bordas</p>
                                {others.map((b) => card(b, false))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>,
        document.body
    )
}
