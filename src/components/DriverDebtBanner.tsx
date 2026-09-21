// components/DriverDebtBanner.tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'
import { AlertTriangle, X, Copy, CreditCard } from 'lucide-react'

const DEBT_LIMIT = 50

interface PixData {
    pixQrCodeImage: string
    pixCopyPaste: string
    invoiceUrl: string
}

// Mostra o saldo devedor do pós-pago (R$0,50 por corrida finalizada) e, ao
// atingir R$50, vira um aviso bloqueante com botão de pagar via Pix.
// Montado em painel-motorista e aceitar-corridas — só faz sentido pra quem
// já tem o modo motorista disponível.
export default function DriverDebtBanner({ userId }: { userId: string | null }) {
    const { colors } = useTheme()
    const [debt, setDebt] = useState(0)
    const [isPostpaid, setIsPostpaid] = useState(false)
    const [loading, setLoading] = useState(true)
    const [paying, setPaying] = useState(false)
    const [pixData, setPixData] = useState<PixData | null>(null)
    const [cpfPrompt, setCpfPrompt] = useState(false)
    const [cpfInput, setCpfInput] = useState('')
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const loadDebt = useCallback(async () => {
        if (!userId) {
            setLoading(false)
            return
        }
        const { data } = await supabase
            .from('driver_postpaid_charges')
            .select('amount')
            .eq('driver_id', userId)
        const total = (data || []).reduce((acc, r) => acc + Number(r.amount), 0)
        setDebt(total)
        setLoading(false)
        return total
    }, [userId])

    useEffect(() => { loadDebt() }, [loadDebt])

    useEffect(() => {
        if (!userId) return
        supabase.rpc('is_postpaid_user', { p_user_id: userId }).then(({ data }) => setIsPostpaid(!!data))
    }, [userId])

    useEffect(() => () => {
        if (pollRef.current) clearInterval(pollRef.current)
    }, [])

    const startPay = async (cpfCnpj?: string) => {
        setPaying(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return

            const res = await fetch('/api/driver-debt/pay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ cpfCnpj }),
            })
            const json = await res.json()
            if (!res.ok) {
                if (json.needsCpf) {
                    setCpfPrompt(true)
                    return
                }
                throw new Error(json.error || 'Erro ao gerar cobrança')
            }

            setPixData(json)
            setCpfPrompt(false)

            pollRef.current = setInterval(async () => {
                const total = await loadDebt()
                if (total != null && total < DEBT_LIMIT) {
                    if (pollRef.current) clearInterval(pollRef.current)
                    pollRef.current = null
                    setPixData(null)
                    toast.success('Dívida quitada!')
                }
            }, 4000)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao gerar cobrança')
        } finally {
            setPaying(false)
        }
    }

    const handleConfirmCpf = () => {
        const clean = cpfInput.replace(/\D/g, '')
        if (clean.length !== 11 && clean.length !== 14) {
            toast.error('CPF (11 dígitos) ou CNPJ (14 dígitos) inválido')
            return
        }
        setCpfInput('')
        startPay(clean)
    }

    if (loading || (debt <= 0 && !isPostpaid)) return null

    const isBlocking = debt >= DEBT_LIMIT

    return (
        <>
            <div
                className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-4"
                style={isBlocking
                    ? { background: '#ef444420', border: '1px solid #ef444460' }
                    : { background: `${colors.border}20`, border: `1px solid ${colors.border}` }}
            >
                <AlertTriangle size={18} style={{ color: isBlocking ? '#ef4444' : colors.textSecondary }} className="flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-black" style={{ color: isBlocking ? '#ef4444' : colors.textPrimary }}>
                        {isBlocking ? 'Pós-pago atingiu R$ 50,00' : `Pós-pago: R$ ${debt.toFixed(2)} acumulados`}
                    </p>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                        {isBlocking
                            ? 'Quite pra continuar aceitando novas corridas'
                            : 'Cada serviço oferecido (corrida, serviço ou pedido de loja) usa R$ 0,50 de crédito — pague via Pix ao chegar em R$ 50'}
                    </p>
                    <Link href="/planos/pos-pago" className="inline-block mt-1 text-[11px] font-black underline" style={{ color: '#f97316' }}>
                        Saber mais
                    </Link>
                </div>
                {isBlocking && (
                    <button
                        onClick={() => startPay()}
                        disabled={paying}
                        className="px-3.5 py-2 rounded-full text-xs font-black text-white disabled:opacity-60 flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}
                    >
                        {paying ? <Spinner size={12} color="#ffffff" /> : 'Pagar agora'}
                    </button>
                )}
            </div>

            {cpfPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: colors.surface }}>
                        <p className="font-black text-sm mb-2" style={{ color: colors.textPrimary }}>Confirme seu CPF ou CNPJ</p>
                        <input
                            value={cpfInput}
                            onChange={(e) => setCpfInput(e.target.value)}
                            placeholder="Só números"
                            className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none mb-3"
                            style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                        />
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCpfPrompt(false)}
                                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                                style={{ background: `${colors.border}30`, color: colors.textSecondary }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmCpf}
                                disabled={paying}
                                className="flex-1 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60 text-white"
                                style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}
                            >
                                {paying ? <Spinner size={14} color="#ffffff" /> : 'Continuar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {pixData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="w-full max-w-sm rounded-2xl p-6 relative" style={{ background: colors.surface }}>
                        <button onClick={() => { setPixData(null); if (pollRef.current) clearInterval(pollRef.current) }} className="absolute top-4 right-4" style={{ color: colors.textSecondary }}>
                            <X size={20} />
                        </button>
                        <div className="flex flex-col items-center gap-3">
                            <p className="font-black text-sm" style={{ color: colors.textPrimary }}>Pague com PIX pra quitar</p>
                            <img src={`data:image/png;base64,${pixData.pixQrCodeImage}`} alt="QR Code PIX" className="w-48 h-48 rounded-xl" />
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(pixData.pixCopyPaste)
                                    toast.success('Código copiado!')
                                }}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold"
                                style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                            >
                                <Copy size={14} /> Copiar código PIX
                            </button>

                            <div className="flex items-center gap-2 w-full my-1">
                                <div className="flex-1 h-px" style={{ background: colors.border }} />
                                <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>ou</span>
                                <div className="flex-1 h-px" style={{ background: colors.border }} />
                            </div>

                            <a
                                href={pixData.invoiceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold"
                                style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                            >
                                <CreditCard size={14} /> Pagar com cartão
                            </a>

                            <div className="flex items-center gap-2 mt-1">
                                <Spinner size={14} color={colors.textSecondary} />
                                <span className="text-xs" style={{ color: colors.textSecondary }}>Aguardando confirmação...</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
