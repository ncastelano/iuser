// app/(main)/[ownerSlug]/StoreVipClubMember.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { hexToRgb } from '@/lib/color'
import { toast } from '@/lib/toast'
import { Crown, Check, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import ClubPayDialog from '@/components/club/ClubPayDialog'
import { canSubscribe, fetchClubInfo, moneyText, offerLine, periodLine, renewState, type ClubInfo } from '@/modules/club'

interface StoreVipClubMemberProps {
    storeId: string
    userId: string | null
}

interface Campaign {
    campaign_id: string
    name: string
    description: string | null
    image_url: string | null
    discount_type: 'percent' | 'fixed' | 'full'
    discount_value: number | null
}

const GRADIENT = 'linear-gradient(135deg, #a855f7, #6366f1)'

export default function StoreVipClubMember({ storeId, userId }: StoreVipClubMemberProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const [vipEnabled, setVipEnabled] = useState(false)
    const [isMember, setIsMember] = useState(false)
    const [info, setInfo] = useState<ClubInfo | null>(null)
    const [payOpen, setPayOpen] = useState(false)
    const [storeName, setStoreName] = useState('')
    const [joining, setJoining] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [campaigns, setCampaigns] = useState<Campaign[]>([])
    const [loadingCampaigns, setLoadingCampaigns] = useState(false)
    const [redeemedCodes, setRedeemedCodes] = useState<Record<string, string>>({})
    const [redeemingId, setRedeemingId] = useState<string | null>(null)

    // a situação do clube vem do banco numa chamada só (grátis ou pago; o pago vence, o grátis não)
    const checkMembership = useCallback(async () => {
        const i = await fetchClubInfo(storeId)
        setInfo(i)
        setVipEnabled(!!i?.enabled)
        setIsMember(!!i?.my?.active)
        if (i?.enabled && !storeName) {
            const { data } = await supabase.from('stores').select('name').eq('id', storeId).maybeSingle()
            setStoreName(data?.name || 'a loja')
        }
    }, [storeId, userId])  // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { checkMembership() }, [checkMembership])

    const loadCampaigns = useCallback(async () => {
        setLoadingCampaigns(true)
        try {
            const { data, error } = await supabase.rpc('get_vip_campaigns', { p_store_id: storeId })
            if (error) throw error
            setCampaigns((data as Campaign[]) || [])
        } catch (err: any) {
            console.error('[StoreVipClubMember] Erro ao carregar campanhas:', err.message)
        } finally {
            setLoadingCampaigns(false)
        }
    }, [storeId])

    useEffect(() => {
        if (isExpanded && isMember) loadCampaigns()
    }, [isExpanded, isMember, loadCampaigns])

    const handleJoin = async () => {
        if (!userId) {
            toast.error('Entre na sua conta pra participar do clube')
            return
        }
        setJoining(true)
        try {
            const { error } = await supabase.rpc('join_vip_club', { p_store_id: storeId })
            if (error) throw error
            setIsMember(true)
            setIsExpanded(true)
            toast.success('Você entrou no Club VIP! 🎉')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao entrar no clube')
        } finally {
            setJoining(false)
        }
    }

    const handleRedeem = async (campaignId: string) => {
        setRedeemingId(campaignId)
        try {
            const { data, error } = await supabase.rpc('redeem_campaign_code', { p_campaign_id: campaignId }).single()
            if (error || !data) throw error || new Error('Erro ao resgatar')
            const code = (data as any).code as string
            setRedeemedCodes((prev) => ({ ...prev, [campaignId]: code }))
        } catch (err: any) {
            toast.error(err.message || 'Erro ao resgatar')
        } finally {
            setRedeemingId(null)
        }
    }

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code)
        toast.success('Código copiado!')
    }

    const discountLabel = (c: Campaign) => {
        if (c.discount_type === 'full') return 'Grátis'
        if (c.discount_type === 'percent') return `${c.discount_value}% off`
        return `R$ ${Number(c.discount_value).toFixed(2)} off`
    }

    if (!vipEnabled) return null
    const paidClub = !!info && info.priceCents != null && !info.isOwner
    const startPaid = () => {
        if (!userId) { toast.error('Entre na sua conta para assinar o clube'); return }
        if (info && !canSubscribe(info)) { toast.error('Esta loja ainda não recebe pagamentos pelo clube.'); return }
        setPayOpen(true)
    }
    const my = info?.my
    const rState = renewState(my)

    return (
        <div
            className="rounded-2xl p-4 flex flex-col gap-3"
            style={{
                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                border: `1px solid ${colors.border}`,
            }}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, color: '#fff' }}>
                        <Crown size={18} />
                    </div>
                    <div>
                        <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Club VIP</p>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                            {paidClub ? offerLine(info!) : isMember ? 'Você é membro' : 'Entre pra ver campanhas exclusivas'}
                        </p>
                    </div>
                </div>
                {isMember ? (
                    <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 rounded-full" style={{ color: colors.textSecondary }}>
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                ) : (
                    <button
                        onClick={paidClub ? startPaid : handleJoin}
                        disabled={joining}
                        className="px-4 py-2 rounded-full font-black text-xs disabled:opacity-60"
                        style={{ background: GRADIENT, color: '#fff' }}
                    >
                        {joining ? '...' : paidClub ? `Assinar · ${moneyText(info!.priceCents!)}/mês` : 'Entrar'}
                    </button>
                )}
            </div>

            {paidClub && my?.paid && (
                <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: rState === 'ok' ? '#22c55e18' : '#f59e0b1f' }}>
                    <span className="text-[12px] font-bold" style={{ color: rState === 'ok' ? '#16a34a' : '#b45309' }}>{periodLine(my)}{my.musicOk ? ' · músicas liberadas' : ''}</span>
                    {rState !== 'ok' && <button onClick={startPaid} className="px-3 py-1.5 rounded-full text-[11px] font-black text-white flex-shrink-0" style={{ background: GRADIENT }}>{rState === 'expired' ? 'Assinar de novo' : 'Renovar'}</button>}
                </div>
            )}
            {paidClub && my?.openStatus && (
                <p className="text-[11px] font-bold" style={{ color: '#7c3aed' }}>{my.openStatus === 'reported' ? 'Pagamento enviado: aguardando a loja confirmar o Pix.' : 'Você começou a assinar: falta pagar o Pix e tocar em "Já fiz o Pix".'}</p>
            )}

            {isMember && isExpanded && (
                <div className="flex flex-col gap-2 pt-1">
                    {loadingCampaigns ? (
                        <div className="flex justify-center py-4">
                            <div className="w-5 h-5 border-2 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
                        </div>
                    ) : campaigns.length === 0 ? (
                        <p className="text-xs text-center py-3" style={{ color: colors.textSecondary }}>Nenhuma campanha ativa no momento.</p>
                    ) : (
                        campaigns.map((c) => {
                            const code = redeemedCodes[c.campaign_id]
                            return (
                                <div key={c.campaign_id} className="rounded-xl p-3" style={{ background: `${colors.border}20` }}>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{c.name}</p>
                                            {c.description && (
                                                <p className="text-[10px] truncate" style={{ color: colors.textSecondary }}>{c.description}</p>
                                            )}
                                        </div>
                                        <span className="text-[10px] font-black px-2 py-1 rounded-full flex-shrink-0" style={{ background: '#22c55e20', color: '#22c55e' }}>
                                            {discountLabel(c)}
                                        </span>
                                    </div>

                                    {code ? (
                                        <div className="flex items-center justify-between gap-2 mt-2 px-3 py-2 rounded-lg" style={{ background: colors.background }}>
                                            <span className="text-sm font-mono font-black tracking-wider" style={{ color: colors.textPrimary }}>{code}</span>
                                            <button onClick={() => copyCode(code)} className="p-1 rounded-full" style={{ color: colors.accent }}>
                                                <Copy size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleRedeem(c.campaign_id)}
                                            disabled={redeemingId === c.campaign_id}
                                            className="w-full mt-2 py-2 rounded-lg text-[11px] font-black flex items-center justify-center gap-1.5 disabled:opacity-60"
                                            style={{ background: GRADIENT, color: '#fff' }}
                                        >
                                            <Check size={12} />
                                            {redeemingId === c.campaign_id ? 'Resgatando...' : 'Resgatar'}
                                        </button>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            )}
                    <ClubPayDialog open={payOpen} onClose={() => setPayOpen(false)} onDone={() => checkMembership()} storeId={storeId} storeName={storeName || 'a loja'} includesMusic={!!info?.includesMusic} />
        </div>
    )
}
