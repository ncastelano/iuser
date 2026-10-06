// src/components/Commission.tsx

'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { hexToRgb } from '@/lib/color'
import {
    Users,
    ChevronDown,
    ChevronUp,
    User,
    UserPlus,
    Copy,
    Check,
    X,
    Share2,
    Send,
    MessageCircle,
    Link2,
    Image,
    Music2,
    Wallet,
    Receipt,
    ArrowDownCircle,
    ArrowUpCircle,
    Clock,
    Gift,
    History,
    Search,
    ShieldCheck,
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { formatDistanceToNow } from 'date-fns'
import { ptBR as ptBRLocale } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { usePersistedExpanded } from '@/hooks/usePersistedExpanded'
import { callAdminApi } from '@/lib/callAdminApi'
import { getAvatarUrl } from '@/lib/avatar'
import {
    SCOPE_LABEL,
    hasAnyGrantPermission,
    type BenefitHistoryRow,
    type GrantTarget,
    type GrantablePlan,
    type MyStatus,
} from '@/lib/benefits/types'


// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
    textDecoration: 'none',
}

const pillButtonFullStyle = {
    ...pillButtonStyle,
    width: '100%',
    padding: '0.75rem 1.25rem',
    fontSize: '0.875rem',
}

// ============================================
// INTERFACES
// ============================================

interface CommissionProps {
    userId: string
    profileSlug?: string | null
    onLatestUpdate?: (iso: string) => void
}

interface CommissionSale {
    planName: string
    amount: number
    date: string
}

interface CommissionMember {
    id: string
    name: string
    avatar_url: string | null
    created_at: string
    profileSlug: string | null
    activePlans: string | null
    commissionTotal: number
    /** Quanto a pessoa paga por ciclo no plano ativo (pré-pago tem preço; pós-pago é 0, cobra por evento). */
    planPrice: number
    /** Dívida acumulada dela no pós-pago, ainda não quitada. */
    postpaidDebt: number
    sales: CommissionSale[]
}

interface WalletTransaction {
    id: string
    type: 'commission_credit' | 'withdrawal_debit'
    amount: number
    description: string | null
    created_at: string
}

interface WithdrawalRequest {
    id: string
    amount: number
    pix_key: string
    status: 'pending' | 'paid' | 'rejected' | 'failed'
    failure_reason: string | null
    requested_at: string
}

const WITHDRAWAL_STATUS_LABEL: Record<WithdrawalRequest['status'], string> = {
    pending: 'Pendente',
    paid: 'Pago',
    rejected: 'Rejeitado',
    failed: 'Falhou',
}

const WITHDRAWAL_STATUS_COLOR: Record<WithdrawalRequest['status'], string> = {
    pending: '#eab308',
    paid: '#22c55e',
    rejected: '#ef4444',
    failed: '#ef4444',
}

const MIN_WITHDRAWAL_AMOUNT = 20

type Pane = 'rede' | 'status' | 'grant' | 'history'

// 31/12 23:59:59 (Brasília), em dias a partir de agora.
function daysUntilEndOfYear(): number {
    const now = new Date()
    const end = new Date(Date.UTC(now.getUTCFullYear(), 11, 32, 2, 59, 59))
    return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
}

const GRANT_DURATIONS = [
    { value: '7', label: '7 dias' },
    { value: '15', label: '15 dias' },
    { value: '30', label: '30 dias' },
    { value: '60', label: '60 dias' },
    { value: '90', label: '90 dias' },
    { value: '180', label: '180 dias' },
    { value: '365', label: '1 ano' },
    { value: 'eoy', label: 'Até o fim do ano' },
]

const formatBenefitDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

function formatWalletDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ============================================
// ÍCONES DAS REDES SOCIAIS
// ============================================

const InstagramIcon = ({ size = 24, color = '#fff' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
)

const FacebookIcon = ({ size = 24, color = '#fff' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
)

const TwitterIcon = ({ size = 24, color = '#fff' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
    </svg>
)

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export default function Commission({ userId, profileSlug, onLatestUpdate }: CommissionProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const router = useRouter()

    const [loading, setLoading] = useState(true)
    const [members, setMembers] = useState<CommissionMember[]>([])
    const [isExpanded, setIsExpanded] = usePersistedExpanded('commission', true)
    const [copied, setCopied] = useState(false)
    const [showShareModal, setShowShareModal] = useState(false)
    const [shareLink, setShareLink] = useState('')
    const [shareMessage, setShareMessage] = useState('')
    const [userProfileSlug, setUserProfileSlug] = useState<string | null>(profileSlug || null)

    // ============================================
    // CARTEIRA (saldo + saque via PIX) — embutida aqui porque quem indica
    // pessoas é quem recebe a comissão; junto do extrato de indicados fica
    // mais claro de onde vem o saldo.
    // ============================================
    const [walletLoading, setWalletLoading] = useState(true)
    const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[]>([])
    const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([])
    const [showWithdrawForm, setShowWithdrawForm] = useState(false)
    const [withdrawAmount, setWithdrawAmount] = useState('')
    const [pixKey, setPixKey] = useState('')
    const [pixKeyType, setPixKeyType] = useState('cpf')
    const [submittingWithdraw, setSubmittingWithdraw] = useState(false)

    // ============================================
    // MINHA REDE: tudo o que antes era a aba "Minha Rede" (rede, meu status,
    // conceder e histórico) mora aqui, em "Convidei para o iUser".
    // O que cada pessoa vê vem do banco já filtrado por permissão/escopo —
    // esconder aba aqui é só conforto; quem decide é o servidor.
    // ============================================
    const [pane, setPane] = useState<Pane>('rede')
    const [status, setStatus] = useState<MyStatus | null>(null)
    const [plans, setPlans] = useState<GrantablePlan[]>([])

    const [grantQuery, setGrantQuery] = useState('')
    const [grantResults, setGrantResults] = useState<GrantTarget[]>([])
    const [grantSearching, setGrantSearching] = useState(false)
    const [grantTarget, setGrantTarget] = useState<GrantTarget | null>(null)
    const [grantPlanId, setGrantPlanId] = useState('')
    const [grantDuration, setGrantDuration] = useState('30')
    const [grantReason, setGrantReason] = useState('')
    const [grantStartsAt, setGrantStartsAt] = useState('')
    const [granting, setGranting] = useState(false)

    const [history, setHistory] = useState<BenefitHistoryRow[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    const canManage = hasAnyGrantPermission(status)
    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const borderColor = colors.border

    // ============================================
    // BUSCAR PROFILE SLUG DO USUÁRIO
    // ============================================

    const fetchUserProfileSlug = useCallback(async () => {
        if (profileSlug) {
            setUserProfileSlug(profileSlug)
            return
        }

        if (!userId) return

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('profileSlug')
                .eq('id', userId)
                .maybeSingle()

            if (error) {
                console.error('Erro ao buscar profileSlug:', error)
                return
            }

            if (data?.profileSlug) {
                setUserProfileSlug(data.profileSlug)
                console.log('✅ ProfileSlug encontrado:', data.profileSlug)
            } else {
                console.warn('⚠️ Usuário não tem profileSlug definido')
            }
        } catch (error) {
            console.error('Erro ao buscar profileSlug:', error)
        }
    }, [userId, profileSlug])

    // ============================================
    // BUSCAR PESSOAS CONVIDADAS
    // ============================================

    const fetchCommissionData = useCallback(async () => {
        if (!userId) {
            console.warn('⚠️ userId não fornecido')
            setLoading(false)
            return
        }

        setLoading(true)
        try {
            // RPC (security definer) em vez de query direta: precisa ler
            // subscriptions/wallet_transactions de OUTRAS pessoas (quem foi
            // indicado), e essas tabelas só deixam o dono ler a própria
            // linha por RLS — a função já filtra por upline_id = auth.uid()
            // internamente, nunca vaza dado de quem não foi indicado por mim.
            const { data: downlineData, error } = await supabase.rpc('get_referral_commission_summary')

            if (error) {
                console.error('❌ Erro ao buscar dados:', error)
                setLoading(false)
                return
            }

            const members: CommissionMember[] = (downlineData || []).map((item: any) => ({
                id: item.downline_id,
                name: item.name || 'Usuário',
                avatar_url: item.avatar_url || null,
                created_at: item.joined_at || new Date().toISOString(),
                profileSlug: item.profile_slug || null,
                activePlans: item.active_plans || null,
                commissionTotal: Number(item.commission_total) || 0,
                planPrice: Number(item.plan_price) || 0,
                postpaidDebt: Number(item.postpaid_debt) || 0,
                sales: Array.isArray(item.sales)
                    ? item.sales.map((s: any) => ({
                        planName: s.plan_name,
                        amount: Number(s.amount) || 0,
                        date: s.date,
                    }))
                    : [],
            }))

            setMembers(members)
            if (members.length > 0) onLatestUpdate?.(members[0].created_at)

        } catch (error) {
            console.error('❌ Erro ao carregar dados:', error)
        } finally {
            setLoading(false)
        }
    }, [userId, onLatestUpdate])

    const fetchWalletData = useCallback(async () => {
        if (!userId) {
            setWalletLoading(false)
            return
        }
        setWalletLoading(true)
        const [{ data: transactions }, { data: withdrawals }] = await Promise.all([
            supabase
                .from('wallet_transactions')
                .select('id, type, amount, description, created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false }),
            supabase
                .from('withdrawal_requests')
                .select('id, amount, pix_key, status, failure_reason, requested_at')
                .eq('user_id', userId)
                .order('requested_at', { ascending: false }),
        ])
        setWalletTransactions(transactions || [])
        setWithdrawalRequests(withdrawals || [])
        setWalletLoading(false)
    }, [userId])

    // ============================================
    // USE EFFECT
    // ============================================

    useEffect(() => {
        if (userId) {
            fetchUserProfileSlug()
            fetchCommissionData()
            fetchWalletData()
        } else {
            console.warn('⚠️ Commission: userId não fornecido')
            setLoading(false)
            setWalletLoading(false)
        }
    }, [userId, fetchUserProfileSlug, fetchCommissionData, fetchWalletData])

    const walletBalance = walletTransactions.reduce((sum, t) => sum + Number(t.amount), 0)

    useEffect(() => {
        if (!userId) return
        let cancelled = false
        Promise.all([supabase.rpc('get_my_status'), supabase.rpc('get_my_grantable_plans')]).then(([{ data: statusData }, { data: plansData }]) => {
            if (cancelled) return
            setStatus((statusData as MyStatus) || null)
            const list = (plansData as GrantablePlan[]) || []
            setPlans(list)
            setGrantPlanId((prev) => (prev && list.some((p) => p.id === prev) ? prev : list[0]?.id || ''))
        })
        return () => { cancelled = true }
    }, [userId])

    // Busca de pessoas pra conceder (dentro do escopo, filtrado pelo banco).
    useEffect(() => {
        if (grantTarget || grantQuery.trim().length < 2) {
            setGrantResults([])
            return
        }
        setGrantSearching(true)
        const t = setTimeout(async () => {
            const { data } = await supabase.rpc('find_grant_targets', { p_query: grantQuery.trim() })
            setGrantResults((data as GrantTarget[]) || [])
            setGrantSearching(false)
        }, 300)
        return () => clearTimeout(t)
    }, [grantQuery, grantTarget])

    useEffect(() => {
        if (pane !== 'history') return
        setLoadingHistory(true)
        supabase.rpc('get_benefit_history', { p_limit: 100, p_only_granted: true }).then(({ data }) => {
            setHistory((data as BenefitHistoryRow[]) || [])
            setLoadingHistory(false)
        })
    }, [pane])

    const handleGrant = async () => {
        if (!grantTarget || !grantPlanId) return
        setGranting(true)
        try {
            await callAdminApi('/api/benefits/grant', {
                targetUserId: grantTarget.id,
                planId: grantPlanId,
                days: grantDuration === 'eoy' ? daysUntilEndOfYear() : Number(grantDuration),
                reason: grantReason.trim() || undefined,
                startsAt: grantStartsAt ? new Date(`${grantStartsAt}T00:00:00`).toISOString() : undefined,
            })
            const plan = plans.find((p) => p.id === grantPlanId)
            toast.success(`${plan?.name || 'Benefício'} concedido a ${grantTarget.name || `@${grantTarget.profile_slug}`}!`)
            setGrantTarget(null)
            setGrantQuery('')
            setGrantReason('')
            setGrantStartsAt('')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao conceder benefício')
        } finally {
            setGranting(false)
        }
    }

    const handleWithdraw = async () => {
        const amount = Number(withdrawAmount.replace(',', '.'))
        if (!amount || amount <= 0) {
            toast.error('Informe um valor válido')
            return
        }
        if (amount < MIN_WITHDRAWAL_AMOUNT) {
            toast.error(`Valor mínimo de saque: R$ ${MIN_WITHDRAWAL_AMOUNT.toFixed(2)}`)
            return
        }
        if (amount > walletBalance) {
            toast.error('Saldo insuficiente')
            return
        }
        if (!pixKey.trim()) {
            toast.error('Informe sua chave PIX')
            return
        }

        setSubmittingWithdraw(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch('/api/wallet/request-withdrawal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({ amount, pixKey: pixKey.trim(), pixKeyType }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'Erro ao solicitar saque')

            toast.success('Saque enviado! O PIX já foi transferido pra sua chave.')
            setShowWithdrawForm(false)
            setWithdrawAmount('')
            setPixKey('')
            await fetchWalletData()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao solicitar saque')
        } finally {
            setSubmittingWithdraw(false)
        }
    }

    // ============================================
    // FUNÇÕES AUXILIARES
    // ============================================

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        }).format(value)
    }

    const getImageUrl = (path: string | null) => {
        if (!path) return null
        if (path.startsWith('http')) return path
        return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    }

    // ============================================
    // COMPARTILHAR CONVITE
    // ============================================

    const handleInvite = () => {
        const slug = userProfileSlug || 'convidar'
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://iuser.com.br'
        const link = `${baseUrl}/convite?ref=${slug}`

        console.log('🔗 Link de convite gerado:', link)
        console.log('📝 ProfileSlug usado:', slug)

        setShareLink(link)
        setShareMessage(`@${slug} te chama pro iUser — compre, venda, preste serviço ou dirija, tudo numa plataforma só, sem taxa escondida.\n\nEntre pelo meu link e comece agora:\n\n${link}`)
        setShowShareModal(true)
    }

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareLink)
            setCopied(true)
            toast.success('Link copiado!')
            setTimeout(() => setCopied(false), 3000)
        } catch {
            toast.error('Erro ao copiar link')
        }
    }

    const shareToWhatsApp = () => {
        const url = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`
        window.open(url, '_blank')
    }

    const shareToFacebook = () => {
        const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareLink)}&quote=${encodeURIComponent(shareMessage)}`
        window.open(url, '_blank')
    }

    const shareToInstagram = () => {
        navigator.clipboard.writeText(shareMessage)
        toast.success('Mensagem copiada! Cole no Instagram Stories.')
    }

    const shareToTikTok = () => {
        navigator.clipboard.writeText(shareMessage)
        toast.success('Mensagem copiada! Cole no TikTok.')
    }

    const shareToTwitter = () => {
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}`
        window.open(url, '_blank')
    }

    // ============================================
    // RENDER
    // ============================================

    if (!userId) {
        console.warn('⚠️ Commission: userId é undefined ou null')
        return null
    }

    const totalCommission = members.reduce((acc, m) => acc + m.commissionTotal, 0)
    const subCardStyle = {
        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
        border: `1px solid ${borderColor}`,
        borderRadius: 16,
        padding: 16,
    }
    const grantInputStyle: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${borderColor}`,
        color: textPrimary,
        borderRadius: 12,
        padding: '10px 12px',
        fontSize: 13,
        width: '100%',
    }
    const selectedGrantPlan = plans.find((p) => p.id === grantPlanId)
    // Quem não pode conceder nada não tem Conceder/Histórico.
    const activePane: Pane = (pane === 'grant' || pane === 'history') && !canManage ? 'rede' : pane
    const panes: { id: Pane; label: string; icon: typeof Gift }[] = [
        { id: 'rede', label: 'Minha rede', icon: Users },
        { id: 'status', label: 'Meu status', icon: ShieldCheck },
        ...(canManage ? [{ id: 'grant' as const, label: 'Conceder', icon: Gift }, { id: 'history' as const, label: 'Histórico', icon: History }] : []),
    ]
    const networkPaidValue = members.reduce((acc, m) => acc + m.planPrice, 0)
    const networkPromisedValue = members.reduce((acc, m) => acc + m.postpaidDebt, 0)

    return (
        <>
            <div className="mb-6 mt-4">
                <div
                    className="rounded-2xl p-6 pt-7 flex flex-col gap-5 relative"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: `1px solid ${borderColor}`,
                        boxShadow: colors.shadow,
                    }}
                >
                    {/* Cabeçalho com toggle - PILL */}
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="w-full flex items-center justify-between text-left"
                        style={{
                            padding: '0.5rem 0.75rem',
                            borderRadius: '9999px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                        }}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: GRADIENT,
                                    color: '#ffffff',
                                }}
                            >
                                <Users size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                    Convidei para o iUser
                                </h3>
                                <p className="text-xs mt-0.5" style={{ color: textSecondary }}>
                                    {members.length} pessoa{members.length !== 1 ? 's' : ''} na sua rede
                                    {totalCommission > 0 && ` · ${formatCurrency(totalCommission)} em comissão`}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {members.length > 0 && (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: '#f9731620', color: '#f97316' }}>
                                    {members.length}
                                </span>
                            )}
                            {isExpanded ? (
                                <ChevronUp size={22} style={{ color: textSecondary }} />
                            ) : (
                                <ChevronDown size={22} style={{ color: textSecondary }} />
                            )}
                        </div>
                    </button>

                    {isExpanded && (
                        <div className="flex flex-col gap-5">
                            {/* Abas internas — o que antes era a aba "Minha Rede" do cabeçalho */}
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {panes.map((t) => {
                                    const Icon = t.icon
                                    const active = activePane === t.id
                                    return (
                                        <button
                                            key={t.id}
                                            onClick={() => setPane(t.id)}
                                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all"
                                            style={active
                                                ? { background: GRADIENT, color: '#fff', border: '1px solid transparent' }
                                                : { background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`, color: textPrimary, border: `1px solid ${borderColor}` }}
                                        >
                                            <Icon size={14} />
                                            {t.label}
                                        </button>
                                    )
                                })}
                            </div>

                            {activePane === 'rede' && (
                            <>
                            {/* ===== CARTEIRA (saldo + saque) ===== */}
                            <div className="w-full rounded-2xl p-6 flex flex-col items-center gap-2" style={{ background: GRADIENT }}>
                                <Wallet size={28} color="#fff" />
                                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.85)' }}>
                                    Saldo disponível
                                </span>
                                <span className="text-3xl font-black" style={{ color: '#fff' }}>
                                    R$ {walletBalance.toFixed(2)}
                                </span>
                            </div>

                            {/* ===== MINHA REDE: resumo do que a rede rende ===== */}
                            {!loading && members.length > 0 && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="rounded-2xl p-3" style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, border: `1px solid ${borderColor}` }}>
                                        <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider" style={{ color: textSecondary }}>
                                            <Check size={11} /> Planos pagos (rede)
                                        </p>
                                        <p className="text-lg font-black mt-1" style={{ color: textPrimary }}>{formatCurrency(networkPaidValue)}</p>
                                        <p className="text-[10px] mt-0.5" style={{ color: textSecondary }}>Mensalidade do pré-pago de quem está ativo</p>
                                    </div>
                                    <div className="rounded-2xl p-3" style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, border: `1px solid ${borderColor}` }}>
                                        <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider" style={{ color: textSecondary }}>
                                            <Clock size={11} /> Prometido (pós-pago)
                                        </p>
                                        <p className="text-lg font-black mt-1" style={{ color: '#f97316' }}>{formatCurrency(networkPromisedValue)}</p>
                                        <p className="text-[10px] mt-0.5" style={{ color: textSecondary }}>Dívida acumulada, ainda não quitada</p>
                                    </div>
                                </div>
                            )}

                            {!showWithdrawForm ? (
                                <div className="flex flex-col gap-2">
                                    <button
                                        onClick={() => setShowWithdrawForm(true)}
                                        disabled={walletBalance < MIN_WITHDRAWAL_AMOUNT}
                                        className="w-full py-3.5 rounded-full font-black uppercase text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                        style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`, border: `1px solid ${borderColor}`, color: textPrimary }}
                                    >
                                        <Send size={16} />
                                        Solicitar saque via PIX
                                    </button>
                                    <p className="text-[10px] text-center" style={{ color: textSecondary }}>
                                        {walletBalance < MIN_WITHDRAWAL_AMOUNT
                                            ? `Saque mínimo: R$ ${MIN_WITHDRAWAL_AMOUNT.toFixed(2)} — faltam R$ ${(MIN_WITHDRAWAL_AMOUNT - walletBalance).toFixed(2)} pra poder sacar.`
                                            : `Valor mínimo de saque: R$ ${MIN_WITHDRAWAL_AMOUNT.toFixed(2)}.`}
                                    </p>
                                </div>
                            ) : (
                                <div className="w-full rounded-2xl p-4 flex flex-col gap-3" style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`, border: `1px solid ${borderColor}` }}>
                                    <p className="text-[11px]" style={{ color: textSecondary }}>
                                        O PIX é enviado automaticamente pra chave abaixo assim que você confirmar. Valor mínimo: R$ {MIN_WITHDRAWAL_AMOUNT.toFixed(2)}.
                                    </p>
                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>Valor (máx. R$ {walletBalance.toFixed(2)})</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={withdrawAmount}
                                        onChange={(e) => setWithdrawAmount(e.target.value)}
                                        placeholder="0,00"
                                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                        style={{ background: colors.background, borderColor: borderColor, color: textPrimary }}
                                    />
                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>Tipo da chave</label>
                                    <select
                                        value={pixKeyType}
                                        onChange={(e) => setPixKeyType(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                        style={{ background: colors.background, borderColor: borderColor, color: textPrimary }}
                                    >
                                        <option value="cpf">CPF</option>
                                        <option value="cnpj">CNPJ</option>
                                        <option value="email">E-mail</option>
                                        <option value="phone">Telefone</option>
                                        <option value="random">Aleatória</option>
                                    </select>
                                    <label className="text-[10px] font-bold uppercase" style={{ color: textSecondary }}>Chave PIX</label>
                                    <input
                                        type="text"
                                        value={pixKey}
                                        onChange={(e) => setPixKey(e.target.value)}
                                        placeholder="CPF, email, telefone ou chave aleatória"
                                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                        style={{ background: colors.background, borderColor: borderColor, color: textPrimary }}
                                    />
                                    <div className="flex gap-2 mt-1">
                                        <button
                                            onClick={() => setShowWithdrawForm(false)}
                                            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                                            style={{ background: `${borderColor}30`, color: textPrimary }}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleWithdraw}
                                            disabled={submittingWithdraw}
                                            className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
                                            style={{ background: GRADIENT, color: '#fff' }}
                                        >
                                            {submittingWithdraw ? <Spinner size={14} color="#ffffff" /> : 'Confirmar'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {!walletLoading && withdrawalRequests.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <h2 className="text-xs font-black uppercase tracking-widest" style={{ color: textPrimary }}>
                                        Pedidos de saque
                                    </h2>
                                    {withdrawalRequests.map((w) => (
                                        <div
                                            key={w.id}
                                            className="flex flex-col gap-1 p-3 rounded-xl"
                                            style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, border: `1px solid ${borderColor}` }}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Send size={16} style={{ color: textSecondary }} className="flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold truncate" style={{ color: textPrimary }}>
                                                        {w.pix_key}
                                                    </p>
                                                    <p className="text-[10px]" style={{ color: textSecondary }}>
                                                        {formatWalletDate(w.requested_at)}
                                                    </p>
                                                </div>
                                                <span className="text-sm font-black flex-shrink-0" style={{ color: textPrimary }}>
                                                    R$ {Number(w.amount).toFixed(2)}
                                                </span>
                                                <span
                                                    className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full flex-shrink-0"
                                                    style={{ background: `${WITHDRAWAL_STATUS_COLOR[w.status]}20`, color: WITHDRAWAL_STATUS_COLOR[w.status] }}
                                                >
                                                    {WITHDRAWAL_STATUS_LABEL[w.status]}
                                                </span>
                                            </div>
                                            {w.failure_reason && (
                                                <p className="text-[10px]" style={{ color: '#ef4444' }}>
                                                    {w.failure_reason}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!walletLoading && walletTransactions.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <h2 className="text-xs font-black uppercase tracking-widest" style={{ color: textPrimary }}>
                                        Lançamentos
                                    </h2>
                                    {walletTransactions.map((t) => (
                                        <div
                                            key={t.id}
                                            className="flex items-center gap-3 p-3 rounded-xl"
                                            style={{ background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`, border: `1px solid ${borderColor}` }}
                                        >
                                            {t.amount >= 0 ? (
                                                <ArrowDownCircle size={20} color="#22c55e" />
                                            ) : (
                                                <ArrowUpCircle size={20} color="#ef4444" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold truncate" style={{ color: textPrimary }}>
                                                    {t.description || (t.amount >= 0 ? 'Crédito' : 'Débito')}
                                                </p>
                                                <p className="text-[10px]" style={{ color: textSecondary }}>
                                                    {formatWalletDate(t.created_at)}
                                                </p>
                                            </div>
                                            <span className="text-sm font-black flex-shrink-0" style={{ color: t.amount >= 0 ? '#22c55e' : '#ef4444' }}>
                                                {t.amount >= 0 ? '+' : ''}R$ {Number(t.amount).toFixed(2)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Botão Convidar - PILL */}
                            <button
                                onClick={handleInvite}
                                style={{
                                    ...pillButtonFullStyle,
                                    background: GRADIENT,
                                    color: '#ffffff',
                                    boxShadow: `0 4px 12px #f9731640`,
                                }}
                                className="hover:scale-[1.02] transition-transform"
                            >
                                <UserPlus size={16} />
                                Convidar
                            </button>

                            {loading ? (
                                <div
                                    className="rounded-2xl p-8 text-center"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                        border: `1px solid ${borderColor}`,
                                    }}
                                >
                                    <div className="w-6 h-6 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto" />
                                    <p className="mt-3 text-xs" style={{ color: textSecondary }}>
                                        Carregando...
                                    </p>
                                </div>
                            ) : members.length === 0 ? (
                                <div
                                    className="rounded-2xl p-6 text-center flex flex-col items-center gap-4"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                        border: `1px dashed ${borderColor}`,
                                    }}
                                >
                                    <div
                                        className="w-16 h-16 rounded-full flex items-center justify-center"
                                        style={{ background: GRADIENT, color: '#ffffff' }}
                                    >
                                        <UserPlus size={28} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold" style={{ color: textPrimary }}>
                                            Você ainda não indicou ninguém
                                        </p>
                                        <p className="text-xs mt-1" style={{ color: textSecondary }}>
                                            Convide pessoas para começar a construir sua rede
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {members.map(member => {
                                        const avatarUrl = getImageUrl(member.avatar_url)
                                        const hasSales = member.sales.length > 0

                                        return (
                                            <div
                                                key={member.id}
                                                className="rounded-2xl border overflow-hidden"
                                                style={{
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                    borderColor: borderColor,
                                                }}
                                            >
                                                <div
                                                    className="flex items-center gap-3 p-3 cursor-pointer hover:opacity-80 transition-opacity"
                                                    onClick={() => {
                                                        if (member.profileSlug) {
                                                            router.push(`/${member.profileSlug}`)
                                                        }
                                                    }}
                                                >
                                                    <div
                                                        className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                                                        style={{ background: `${accentColor}15` }}
                                                    >
                                                        {avatarUrl ? (
                                                            <img
                                                                src={avatarUrl}
                                                                className="w-full h-full object-cover"
                                                                alt={member.name}
                                                            />
                                                        ) : (
                                                            <User size={22} style={{ color: '#f97316' }} />
                                                        )}
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold truncate" style={{ color: textPrimary }}>
                                                            {member.name}
                                                        </p>
                                                        <p className="text-[10px] mt-0.5" style={{ color: textSecondary }}>
                                                            Entrou {formatDistanceToNow(new Date(member.created_at), {
                                                                addSuffix: true,
                                                                locale: ptBRLocale,
                                                            })}
                                                        </p>
                                                        {member.activePlans ? (
                                                            <span
                                                                className="inline-block mt-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full truncate max-w-full"
                                                                style={{ background: '#22c55e20', color: '#22c55e' }}
                                                                title={member.activePlans}
                                                            >
                                                                {member.activePlans}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-block mt-1.5 text-[9px]" style={{ color: textSecondary }}>
                                                                Sem plano ativo
                                                            </span>
                                                        )}
                                                        {(member.planPrice > 0 || member.postpaidDebt > 0) && (
                                                            <p className="text-[9px] font-bold mt-1">
                                                                {member.planPrice > 0 && <span style={{ color: textPrimary }}>{formatCurrency(member.planPrice)}/mês</span>}
                                                                {member.planPrice > 0 && member.postpaidDebt > 0 && <span style={{ color: textSecondary }}> · </span>}
                                                                {member.postpaidDebt > 0 && <span style={{ color: '#f97316' }}>Deve {formatCurrency(member.postpaidDebt)}</span>}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0 text-right">
                                                        <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: textSecondary }}>
                                                            <Wallet size={10} />
                                                            Comissão
                                                        </span>
                                                        <span className="text-base font-black" style={{ color: member.commissionTotal > 0 ? '#f97316' : textSecondary }}>
                                                            {formatCurrency(member.commissionTotal)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {hasSales && (
                                                    <div
                                                        className="px-3 py-2.5 space-y-1.5 border-t"
                                                        style={{
                                                            borderColor,
                                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.25)`,
                                                        }}
                                                    >
                                                        <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider mb-1" style={{ color: textSecondary }}>
                                                            <Receipt size={11} />
                                                            Extrato de vendas
                                                        </p>
                                                        {member.sales.map((sale, i) => (
                                                            <div key={i} className="flex items-center justify-between text-[11px]">
                                                                <span className="truncate" style={{ color: textPrimary }}>
                                                                    {sale.planName}
                                                                </span>
                                                                <span className="flex items-center gap-2 flex-shrink-0">
                                                                    <span style={{ color: textSecondary }}>
                                                                        {new Date(sale.date).toLocaleDateString('pt-BR')}
                                                                    </span>
                                                                    <span className="font-bold" style={{ color: '#22c55e' }}>
                                                                        +{formatCurrency(sale.amount)}
                                                                    </span>
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                            </>
                            )}

                            {/* ===== MEU STATUS (antes na aba Minha Rede) ===== */}
                            {activePane === 'status' && (
                                <div style={subCardStyle} className="space-y-4">
                                    {status ? (
                                        <>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: textSecondary }}>Meu status</p>
                                                <p className="text-xl font-black" style={{ color: textPrimary }}>{status.name}</p>
                                                {status.description && <p className="text-xs" style={{ color: textSecondary }}>{status.description}</p>}
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: textSecondary }}>Nível</p>
                                                <p className="text-base font-black" style={{ color: textPrimary }}>{status.level}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: textSecondary }}>Permissões</p>
                                                {status.permissions.length === 0 ? (
                                                    <p className="text-xs" style={{ color: textSecondary }}>Nenhuma permissão de gestão.</p>
                                                ) : (
                                                    <ul className="space-y-1.5">
                                                        {status.permissions.map((p) => (
                                                            <li key={p.slug} className="flex items-start gap-2 text-sm" style={{ color: textPrimary }}>
                                                                <Check size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#22c55e' }} />
                                                                <span>
                                                                    <span className="font-semibold">{p.name}</span>
                                                                    <span className="block text-[11px]" style={{ color: textSecondary }}>Escopo: {SCOPE_LABEL[p.scope]}</span>
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex justify-center py-6"><Spinner size={24} color={accentColor} /></div>
                                    )}
                                </div>
                            )}

                            {/* ===== CONCEDER BENEFÍCIO ===== */}
                            {activePane === 'grant' && canManage && (
                                plans.length === 0 ? (
                                    <div className="text-sm" style={{ ...subCardStyle, color: textSecondary }}>
                                        Você não tem permissão para conceder nenhum plano no momento.
                                    </div>
                                ) : (
                                    <div style={subCardStyle} className="space-y-4">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: textSecondary }}>Buscar usuário</p>
                                            {grantTarget ? (
                                                <div className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: `${accentColor}15`, border: `1px solid ${accentColor}55` }}>
                                                    <span className="flex-1 min-w-0 text-sm font-bold truncate" style={{ color: textPrimary }}>
                                                        {grantTarget.name || `@${grantTarget.profile_slug}`}
                                                        {grantTarget.profile_slug && <span className="font-medium" style={{ color: textSecondary }}> @{grantTarget.profile_slug}</span>}
                                                    </span>
                                                    <button onClick={() => { setGrantTarget(null); setGrantQuery('') }} style={{ color: textSecondary }}>
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="relative">
                                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: textSecondary }} />
                                                        <input
                                                            value={grantQuery}
                                                            onChange={(e) => setGrantQuery(e.target.value)}
                                                            placeholder="Nome ou @slug"
                                                            style={{ ...grantInputStyle, paddingLeft: 32 }}
                                                        />
                                                    </div>
                                                    {grantSearching && <p className="text-[11px] mt-1.5" style={{ color: textSecondary }}>Buscando...</p>}
                                                    {!grantSearching && grantQuery.trim().length >= 2 && grantResults.length === 0 && (
                                                        <p className="text-[11px] mt-1.5" style={{ color: textSecondary }}>Ninguém encontrado dentro do seu escopo.</p>
                                                    )}
                                                    {grantResults.length > 0 && (
                                                        <div className="mt-2 rounded-xl overflow-hidden" style={{ border: `1px solid ${borderColor}` }}>
                                                            {grantResults.map((r) => {
                                                                const avatar = getAvatarUrl(supabase, r.avatar_url)
                                                                return (
                                                                    <button
                                                                        key={r.id}
                                                                        onClick={() => { setGrantTarget(r); setGrantResults([]) }}
                                                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-black/5"
                                                                        style={{ borderBottom: `1px solid ${borderColor}` }}
                                                                    >
                                                                        <span className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ background: `${borderColor}40` }}>
                                                                            {avatar && <img src={avatar} alt="" className="w-full h-full object-cover" />}
                                                                        </span>
                                                                        <span className="min-w-0">
                                                                            <span className="block text-sm font-bold truncate" style={{ color: textPrimary }}>{r.name || `@${r.profile_slug}`}</span>
                                                                            {r.profile_slug && <span className="block text-[11px]" style={{ color: textSecondary }}>@{r.profile_slug}</span>}
                                                                        </span>
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: textSecondary }}>Plano</p>
                                                <select value={grantPlanId} onChange={(e) => setGrantPlanId(e.target.value)} style={grantInputStyle}>
                                                    {plans.map((p) => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: textSecondary }}>Duração</p>
                                                <select value={grantDuration} onChange={(e) => setGrantDuration(e.target.value)} style={grantInputStyle}>
                                                    {GRANT_DURATIONS.map((d) => (
                                                        <option key={d.value} value={d.value}>{d.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: textSecondary }}>Início (opcional — vazio = agora)</p>
                                            <input
                                                type="date"
                                                value={grantStartsAt}
                                                min={new Date().toISOString().slice(0, 10)}
                                                onChange={(e) => setGrantStartsAt(e.target.value)}
                                                style={grantInputStyle}
                                            />
                                        </div>

                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: textSecondary }}>Motivo (opcional)</p>
                                            <input value={grantReason} onChange={(e) => setGrantReason(e.target.value)} maxLength={300} placeholder="Ex: parceiro do bairro" style={grantInputStyle} />
                                        </div>

                                        {selectedGrantPlan && (
                                            <p className="text-[11px]" style={{ color: textSecondary }}>
                                                {selectedGrantPlan.description || selectedGrantPlan.name} · escopo: {SCOPE_LABEL[selectedGrantPlan.scope]}
                                            </p>
                                        )}

                                        <button
                                            onClick={handleGrant}
                                            disabled={granting || !grantTarget || !grantPlanId}
                                            className="w-full py-3 rounded-full text-sm font-black text-white disabled:opacity-50 flex items-center justify-center gap-2"
                                            style={{ background: GRADIENT }}
                                        >
                                            {granting ? <Spinner size={14} color="#ffffff" /> : <Check size={16} />}
                                            Conceder benefício
                                        </button>
                                    </div>
                                )
                            )}

                            {/* ===== HISTÓRICO DE BENEFÍCIOS ===== */}
                            {activePane === 'history' && canManage && (
                                <div className="space-y-2">
                                    <p className="text-xs font-black uppercase tracking-wider" style={{ color: textSecondary }}>Histórico de benefícios</p>
                                    {loadingHistory ? (
                                        <div className="flex justify-center py-8"><Spinner size={24} color={accentColor} /></div>
                                    ) : history.length === 0 ? (
                                        <div className="text-sm" style={{ ...subCardStyle, color: textSecondary }}>Nenhum benefício concedido ainda.</div>
                                    ) : (
                                        <div style={{ ...subCardStyle, padding: 0 }} className="overflow-hidden">
                                            {history.map((h, i) => (
                                                <div
                                                    key={h.id}
                                                    className="flex items-center gap-3 px-4 py-3"
                                                    style={{ borderTop: i === 0 ? undefined : `1px solid ${borderColor}` }}
                                                >
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm font-bold truncate" style={{ color: textPrimary }}>
                                                            {h.target_name || (h.target_slug ? `@${h.target_slug}` : 'Pessoa removida')} · {h.plan_name || h.plan_code}
                                                        </p>
                                                        <p className="text-[11px]" style={{ color: textSecondary }}>
                                                            Concedido em {formatBenefitDate(h.created_at)} · {h.is_scheduled ? `começa em ${formatBenefitDate(h.starts_at)} · ` : ''}expira em {formatBenefitDate(h.expires_at)}
                                                            {h.actor_name ? ` · por ${h.actor_name}` : ''}
                                                        </p>
                                                        {h.reason && <p className="text-[11px] italic" style={{ color: textSecondary }}>{h.reason}</p>}
                                                    </div>
                                                    <span
                                                        className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full flex-shrink-0"
                                                        style={h.is_active
                                                            ? { background: '#22c55e20', color: '#22c55e' }
                                                            : h.is_scheduled
                                                                ? { background: '#f9731620', color: '#f97316' }
                                                                : { background: `${borderColor}40`, color: textSecondary }}
                                                    >
                                                        {h.is_active ? 'Ativo' : h.is_scheduled ? 'Agendado' : 'Expirado'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ============================================
            MODAL DE COMPARTILHAMENTO - PILL
            ============================================ */}
            {showShareModal && (
                <div
                    className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                    onClick={() => setShowShareModal(false)}
                >
                    <div
                        className="w-full max-w-md rounded-3xl p-6 shadow-2xl animate-slide-up"
                        style={{
                            background: colors.surface,
                            border: `1px solid ${borderColor}`,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Cabeçalho */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center"
                                    style={{
                                        background: GRADIENT,
                                        color: '#ffffff',
                                    }}
                                >
                                    <Share2 size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black" style={{ color: textPrimary }}>
                                        Convidar
                                    </h3>
                                    <p className="text-xs" style={{ color: textSecondary }}>
                                        Compartilhe com seus amigos
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowShareModal(false)}
                                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                                style={{ color: textSecondary }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Link de convite */}
                        <div
                            className="flex items-center gap-2 p-3 rounded-2xl mb-6"
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                border: `1px solid ${borderColor}`,
                            }}
                        >
                            <Link2 size={16} style={{ color: textSecondary }} />
                            <div className="flex-1">
                                <span className="text-[10px]" style={{ color: textSecondary }}>
                                    Link de convite
                                </span>
                                <input
                                    type="text"
                                    value={shareLink}
                                    readOnly
                                    className="w-full bg-transparent outline-none text-xs font-bold"
                                    style={{ color: '#f97316' }}
                                />
                            </div>
                            <button
                                onClick={handleCopyLink}
                                className="p-1.5 rounded-full transition-colors hover:bg-white/10"
                                style={{ color: textSecondary }}
                            >
                                {copied ? (
                                    <Check size={16} style={{ color: '#10b981' }} />
                                ) : (
                                    <Copy size={16} />
                                )}
                            </button>
                        </div>

                        {/* Opções de compartilhamento - PILL */}
                        <div className="grid grid-cols-4 gap-3 mb-6">
                            <button
                                onClick={shareToWhatsApp}
                                className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all hover:scale-105"
                                style={{
                                    background: '#25D36615',
                                    border: `1px solid #25D36630`,
                                }}
                            >
                                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#25D366' }}>
                                    <MessageCircle size={24} style={{ color: '#fff' }} />
                                </div>
                                <span className="text-[10px] font-bold" style={{ color: textSecondary }}>WhatsApp</span>
                            </button>

                            <button
                                onClick={shareToInstagram}
                                className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all hover:scale-105"
                                style={{
                                    background: '#E1306C15',
                                    border: `1px solid #E1306C30`,
                                }}
                            >
                                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' }}>
                                    <InstagramIcon size={24} color="#fff" />
                                </div>
                                <span className="text-[10px] font-bold" style={{ color: textSecondary }}>Instagram</span>
                            </button>

                            <button
                                onClick={shareToTikTok}
                                className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all hover:scale-105"
                                style={{
                                    background: '#00000015',
                                    border: `1px solid #00000030`,
                                }}
                            >
                                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#000' }}>
                                    <Music2 size={24} style={{ color: '#fff' }} />
                                </div>
                                <span className="text-[10px] font-bold" style={{ color: textSecondary }}>TikTok</span>
                            </button>

                            <button
                                onClick={shareToFacebook}
                                className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all hover:scale-105"
                                style={{
                                    background: '#1877F215',
                                    border: `1px solid #1877F230`,
                                }}
                            >
                                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#1877F2' }}>
                                    <FacebookIcon size={24} color="#fff" />
                                </div>
                                <span className="text-[10px] font-bold" style={{ color: textSecondary }}>Facebook</span>
                            </button>

                            <button
                                onClick={shareToTwitter}
                                className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all hover:scale-105"
                                style={{
                                    background: '#1DA1F215',
                                    border: `1px solid #1DA1F230`,
                                }}
                            >
                                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#1DA1F2' }}>
                                    <TwitterIcon size={24} color="#fff" />
                                </div>
                                <span className="text-[10px] font-bold" style={{ color: textSecondary }}>Twitter/X</span>
                            </button>

                            <button
                                onClick={handleCopyLink}
                                className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all hover:scale-105"
                                style={{
                                    background: '#f9731620',
                                    border: `1px solid #f9731640`,
                                }}
                            >
                                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#ffffff' }}>
                                    <Copy size={24} />
                                </div>
                                <span className="text-[10px] font-bold" style={{ color: textSecondary }}>Copiar Link</span>
                            </button>

                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(shareMessage)
                                    toast.success('Mensagem copiada!')
                                }}
                                className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all hover:scale-105"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    border: `1px solid ${borderColor}`,
                                }}
                            >
                                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: textSecondary + '30', color: textSecondary }}>
                                    <Send size={24} />
                                </div>
                                <span className="text-[10px] font-bold" style={{ color: textSecondary }}>Copiar Texto</span>
                            </button>
                        </div>

                        {/* Botão fechar - PILL */}
                        <button
                            onClick={() => setShowShareModal(false)}
                            style={{
                                ...pillButtonFullStyle,
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px solid ${borderColor}`,
                                color: textSecondary,
                            }}
                            className="hover:opacity-70 transition-opacity"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            )}

            {/* Estilos */}
            <style jsx>{`
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-slide-up {
                    animation: slideUp 0.3s ease-out;
                }
            `}</style>
        </>
    )
}