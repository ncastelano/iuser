// components/StoreAccessGate.tsx
'use client'

import { useState } from 'react'
import { Copy, CheckCircle2, Clock3, KeyRound, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Spinner } from '@/components/Spinner'
import type { useStoreAccessStatus } from '@/hooks/useStoreAccessStatus'

function formatCents(cents: number) {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface StoreAccessGateProps {
    status: ReturnType<typeof useStoreAccessStatus>
    children: React.ReactNode
}

// Trava a criação de loja atrás de um pagamento PIX manual (confirmado pelo
// admin geral) ou de um código de liberação, exceto pra conta admin
// (ncastelano@gmail.com), que sempre passa direto. Envolve o formulário de
// criar loja nos 3 pontos de entrada - enquanto não há acesso liberado,
// mostra esta tela no lugar do formulário. Recebe o resultado de
// useStoreAccessStatus já chamado pela página (em vez de chamar de novo aqui
// dentro), pra quem chama poder ler availableGrant/bypass no submit final.
export function StoreAccessGate({ status, children }: StoreAccessGateProps) {
    const {
        loading,
        bypass,
        settings,
        availableGrant,
        pendingRequest,
        requestManualPixPayment,
        redeemCode,
    } = status

    const [copied, setCopied] = useState(false)
    const [requesting, setRequesting] = useState(false)
    const [code, setCode] = useState('')
    const [redeeming, setRedeeming] = useState(false)

    if (loading) {
        return (
            <div className="w-full flex items-center justify-center py-16">
                <Spinner size={32} color="#f97316" />
            </div>
        )
    }

    if (bypass || availableGrant) {
        return <>{children}</>
    }

    const handleCopyPix = async () => {
        if (!settings?.pix_key) return
        try {
            await navigator.clipboard.writeText(settings.pix_key)
            setCopied(true)
            toast.success('Chave PIX copiada!')
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error('Não foi possível copiar a chave PIX')
        }
    }

    const handleAlreadyPaid = async () => {
        setRequesting(true)
        try {
            await requestManualPixPayment()
            toast.success('Pedido enviado! Aguardando confirmação do administrador.')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao registrar o pagamento')
        } finally {
            setRequesting(false)
        }
    }

    const handleRedeem = async () => {
        if (!code.trim()) return
        setRedeeming(true)
        try {
            await redeemCode(code)
            toast.success('Código aplicado! Sua loja já pode ser criada.')
            setCode('')
        } catch (err: any) {
            toast.error(err.message || 'Código inválido')
        } finally {
            setRedeeming(false)
        }
    }

    const price = settings ? formatCents(settings.price_cents) : '...'
    const validity = settings?.validity_days
        ? `válido por ${settings.validity_days} dia${settings.validity_days > 1 ? 's' : ''}`
        : 'acesso vitalício'

    return (
        <div className="w-full max-w-md mx-auto space-y-4">
            <div className="text-center space-y-1">
                <h2 className="text-lg font-black text-gray-800">Libere sua loja</h2>
                <p className="text-xs text-gray-500">
                    Pra criar sua loja é preciso liberar o acesso: pague {price} via PIX ou use um código de liberação.
                </p>
            </div>

            {pendingRequest ? (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <Clock3 className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-amber-700">Pagamento em análise</p>
                        <p className="text-xs text-amber-600 mt-1">
                            Recebemos seu aviso de pagamento. Assim que o administrador confirmar, sua loja é liberada automaticamente aqui nessa tela.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="bg-white border-2 border-orange-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-700">
                        <Wallet className="w-3.5 h-3.5 text-orange-500" />
                        Pagar via PIX · {price} ({validity})
                    </div>

                    {settings?.pix_key ? (
                        <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                            <div className="flex-1 min-w-0">
                                <p className="text-[9px] uppercase tracking-wider text-gray-500">
                                    Chave PIX {settings.pix_receiver_name ? `· ${settings.pix_receiver_name}` : ''}
                                </p>
                                <p className="text-sm font-bold text-gray-800 truncate">{settings.pix_key}</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleCopyPix}
                                className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center hover:opacity-90 transition"
                                aria-label="Copiar chave PIX"
                            >
                                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                            </button>
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400">Chave PIX ainda não configurada pelo administrador.</p>
                    )}

                    <button
                        type="button"
                        onClick={handleAlreadyPaid}
                        disabled={requesting || !settings?.pix_key}
                        className="w-full py-3 rounded-xl font-black uppercase text-[10px] tracking-wider bg-gradient-to-r from-orange-500 to-red-500 text-white hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {requesting ? <Spinner size={14} /> : 'Já paguei'}
                    </button>
                </div>
            )}

            <div className="bg-white border-2 border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-gray-700">
                    <KeyRound className="w-3.5 h-3.5 text-gray-500" />
                    Tenho um código de liberação
                </div>
                <div className="flex gap-2">
                    <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="Digite o código"
                        className="flex-1 bg-white border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-orange-400 transition-all"
                    />
                    <button
                        type="button"
                        onClick={handleRedeem}
                        disabled={redeeming || !code.trim()}
                        className="px-4 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-wider bg-gray-800 text-white hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center"
                    >
                        {redeeming ? <Spinner size={14} /> : 'Aplicar'}
                    </button>
                </div>
            </div>
        </div>
    )
}
