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
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { formatDistanceToNow } from 'date-fns'
import { ptBR as ptBRLocale } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

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
    sales: CommissionSale[]
}

interface WalletTransaction {
    id: string
    type: 'commission_credit' | 'withdrawal_debit'
    amount: number
    description: string | null
    created_at: string
}

const MIN_WITHDRAWAL_AMOUNT = 20

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
    const [isExpanded, setIsExpanded] = useState(true)
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
    const [showWithdrawForm, setShowWithdrawForm] = useState(false)
    const [withdrawAmount, setWithdrawAmount] = useState('')
    const [pixKey, setPixKey] = useState('')
    const [pixKeyType, setPixKeyType] = useState('cpf')
    const [submittingWithdraw, setSubmittingWithdraw] = useState(false)

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
        const { data } = await supabase
            .from('wallet_transactions')
            .select('id, type, amount, description, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
        setWalletTransactions(data || [])
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
        setShareMessage(`🎉 Oi! Estou usando o iUser e amando! 🚀\n\nVem comigo também, é incrível! Use meu link de convite e vamos juntos construir uma rede incrível:\n\n${link}\n\nTe espero lá! 🙌`)
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
                                    {members.length} pessoa{members.length !== 1 ? 's' : ''} indicada{members.length !== 1 ? 's' : ''}
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