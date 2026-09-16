// app/(main)/carteira/page.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import LoginAndRegister from '@/components/LoginAndRegister/LoginAndRegister'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import { Wallet, ArrowDownCircle, ArrowUpCircle, Send } from 'lucide-react'

export const dynamic = 'force-dynamic'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface WalletTransaction {
    id: string
    type: 'commission_credit' | 'withdrawal_debit'
    amount: number
    description: string | null
    created_at: string
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function CarteiraPage() {
    const { userId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()
    const { colors } = useTheme()

    const [loading, setLoading] = useState(true)
    const [showLogin, setShowLogin] = useState(false)
    const [transactions, setTransactions] = useState<WalletTransaction[]>([])
    const [showWithdrawForm, setShowWithdrawForm] = useState(false)
    const [withdrawAmount, setWithdrawAmount] = useState('')
    const [pixKey, setPixKey] = useState('')
    const [pixKeyType, setPixKeyType] = useState('cpf')
    const [submitting, setSubmitting] = useState(false)

    const MIN_WITHDRAWAL_AMOUNT = 20

    const load = useCallback(async () => {
        if (!userId) {
            setShowLogin(true)
            setLoading(false)
            return
        }
        setShowLogin(false)
        setLoading(true)
        const { data } = await supabase
            .from('wallet_transactions')
            .select('id, type, amount, description, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
        setTransactions(data || [])
        setLoading(false)
    }, [userId])

    useEffect(() => {
        if (!profileLoading) load()
    }, [profileLoading, load])

    const balance = transactions.reduce((sum, t) => sum + Number(t.amount), 0)

    const handleLoginSuccess = () => {
        setShowLogin(false)
        load()
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
        if (amount > balance) {
            toast.error('Saldo insuficiente')
            return
        }
        if (!pixKey.trim()) {
            toast.error('Informe sua chave PIX')
            return
        }

        setSubmitting(true)
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
            await load()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao solicitar saque')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Carteira"
                    showBack={true}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                />

                <section className="px-4 md:px-6 mt-4 pb-24 max-w-lg mx-auto">
                    {loading && (
                        <div className="flex justify-center py-10">
                            <Spinner size={24} color={colors.textSecondary} />
                        </div>
                    )}

                    {!loading && showLogin && (
                        <LoginAndRegister onLoginSuccess={handleLoginSuccess} />
                    )}

                    {!loading && !showLogin && (
                        <div className="flex flex-col gap-5">
                            <div className="w-full rounded-2xl p-6 flex flex-col items-center gap-2" style={{ background: GRADIENT }}>
                                <Wallet size={28} color="#fff" />
                                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.85)' }}>
                                    Saldo disponível
                                </span>
                                <span className="text-3xl font-black" style={{ color: '#fff' }}>
                                    R$ {balance.toFixed(2)}
                                </span>
                            </div>

                            {!showWithdrawForm ? (
                                <button
                                    onClick={() => setShowWithdrawForm(true)}
                                    disabled={balance < MIN_WITHDRAWAL_AMOUNT}
                                    className="w-full py-3.5 rounded-full font-black uppercase text-sm tracking-wider transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                    style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                >
                                    <Send size={16} />
                                    Solicitar saque via PIX
                                </button>
                            ) : (
                                <div className="w-full rounded-2xl p-4 flex flex-col gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                        O PIX é enviado automaticamente pra chave abaixo assim que você confirmar. Valor mínimo: R$ {MIN_WITHDRAWAL_AMOUNT.toFixed(2)}.
                                    </p>
                                    <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>Valor (máx. R$ {balance.toFixed(2)})</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={withdrawAmount}
                                        onChange={(e) => setWithdrawAmount(e.target.value)}
                                        placeholder="0,00"
                                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                        style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                    />
                                    <div className="flex gap-2">
                                        <div className="flex-1">
                                            <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>Tipo da chave</label>
                                            <select
                                                value={pixKeyType}
                                                onChange={(e) => setPixKeyType(e.target.value)}
                                                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none mt-1"
                                                style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                            >
                                                <option value="cpf">CPF</option>
                                                <option value="cnpj">CNPJ</option>
                                                <option value="email">E-mail</option>
                                                <option value="phone">Telefone</option>
                                                <option value="random">Aleatória</option>
                                            </select>
                                        </div>
                                    </div>
                                    <label className="text-[10px] font-bold uppercase" style={{ color: colors.textSecondary }}>Chave PIX</label>
                                    <input
                                        type="text"
                                        value={pixKey}
                                        onChange={(e) => setPixKey(e.target.value)}
                                        placeholder="CPF, email, telefone ou chave aleatória"
                                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                                        style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                                    />
                                    <div className="flex gap-2 mt-1">
                                        <button
                                            onClick={() => setShowWithdrawForm(false)}
                                            className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                                            style={{ background: `${colors.border}30`, color: colors.textPrimary }}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleWithdraw}
                                            disabled={submitting}
                                            className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
                                            style={{ background: GRADIENT, color: '#fff' }}
                                        >
                                            {submitting ? <Spinner size={14} color="#ffffff" /> : 'Confirmar'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col gap-2">
                                <h2 className="text-xs font-black uppercase tracking-widest" style={{ color: colors.textPrimary }}>
                                    Lançamentos
                                </h2>
                                {transactions.length === 0 ? (
                                    <p className="text-sm py-6 text-center" style={{ color: colors.textSecondary }}>
                                        Nenhum lançamento ainda. Indique pessoas que assinem um plano e ganhe comissão aqui.
                                    </p>
                                ) : (
                                    transactions.map((t) => (
                                        <div
                                            key={t.id}
                                            className="flex items-center gap-3 p-3 rounded-xl"
                                            style={{ background: colors.surface, border: `1px solid ${colors.border}` }}
                                        >
                                            {t.amount >= 0 ? (
                                                <ArrowDownCircle size={20} color="#22c55e" />
                                            ) : (
                                                <ArrowUpCircle size={20} color="#ef4444" />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                                    {t.description || (t.amount >= 0 ? 'Crédito' : 'Débito')}
                                                </p>
                                                <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                                    {formatDate(t.created_at)}
                                                </p>
                                            </div>
                                            <span className="text-sm font-black flex-shrink-0" style={{ color: t.amount >= 0 ? '#22c55e' : '#ef4444' }}>
                                                {t.amount >= 0 ? '+' : ''}R$ {Number(t.amount).toFixed(2)}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </section>
            </main>
        </div>
    )
}
