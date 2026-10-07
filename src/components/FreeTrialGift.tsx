// src/components/FreeTrialGift.tsx
//
// Botão do brinde: N dias (90 por padrão) do plano Pré-pago de graça, resgate único
// por conta — vale pra quem já tem plano e pra quem está chegando. Mesmo visual do
// card "Seu plano" (gradiente laranja→vermelho com selo no topo). Aparece no topo do
// ProfileDashboard e nas páginas de planos; o admin liga/desliga e define os dias em
// Admin → Brinde. Faz tudo sozinho: pede login (visitante), confirma, pede CPF/CNPJ
// se faltar e resgata em /api/subscriptions/free-trial.
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Gift, X, Store, Car, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { useFreeTrial, trialDaysLabel } from '@/hooks/useFreeTrial'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

const fmt = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

interface FreeTrialGiftProps {
    // Visitante tocou em resgatar: a página abre o login dela (ex: /planos tem um inline).
    // Sem isso, manda pra /?view=login. Depois de entrar, o card segue pro "tem certeza?".
    onRequireLogin?: () => void
    // Chamado depois de um resgate bem-sucedido (a página pode recarregar os planos dela)
    onClaimed?: () => void
    // Esconde o card pra quem já usou o brinde e ele acabou (no ProfileDashboard não precisa ficar lembrando)
    hideWhenEnded?: boolean
    className?: string
}

export default function FreeTrialGift({ onRequireLogin, onClaimed, hideWhenEnded = false, className = '' }: FreeTrialGiftProps) {
    const { colors } = useTheme()
    const router = useRouter()
    const t = useFreeTrial()
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [cpfOpen, setCpfOpen] = useState(false)
    const [cpfInput, setCpfInput] = useState('')
    const afterLoginRef = useRef(false)

    // Entrou pra resgatar: agora pergunta se pode começar a contar
    useEffect(() => {
        if (t.userId && afterLoginRef.current) {
            afterLoginRef.current = false
            setConfirmOpen(true)
        }
    }, [t.userId])

    if (t.loading) return null
    // Desligado pelo admin: só aparece pra quem ainda tem teste ativo (pra ver até quando vai)
    if (!t.settings.enabled && !t.trialActive) return null
    // Já assina o Pré-pago de verdade: o brinde não faz sentido
    if (t.paidPrepaid) return null
    if (t.trialEnded && hideWhenEnded) return null

    const days = t.settings.durationDays
    const daysLabel = trialDaysLabel(days)
    const left = t.trialActive && t.prepaid?.endsAt
        ? Math.max(0, Math.ceil((new Date(t.prepaid.endsAt).getTime() - Date.now()) / 86400000))
        : null

    const startClaim = () => {
        if (t.userId) {
            setConfirmOpen(true)
        } else {
            afterLoginRef.current = true
            if (onRequireLogin) onRequireLogin()
            else router.push('/?view=login')
        }
    }

    const doClaim = async (cpf?: string) => {
        const res = await t.claimTrial(cpf)
        if (res.ok) {
            toast.success(`${daysLabel} grátis do Pré-pago ativados!`)
            onClaimed?.()
        } else if (res.needsCpf) {
            setCpfOpen(true)
        } else {
            toast.error(res.error || 'Erro ao resgatar')
        }
    }

    const confirmCpf = () => {
        const clean = cpfInput.replace(/\D/g, '')
        if (clean.length !== 11 && clean.length !== 14) {
            toast.error('CPF (11 dígitos) ou CNPJ (14 dígitos) inválido')
            return
        }
        setCpfOpen(false)
        setCpfInput('')
        doClaim(clean)
    }

    const end = new Date()
    end.setDate(end.getDate() + days)

    return (
        <>
            {/* Só o botão (laranja → vermelho) com o selo "Brinde" por cima; os detalhes
                (o que libera, regras) aparecem no diálogo de confirmação. */}
            <div className={`relative pt-2.5 ${className}`}>
                <span
                    className="absolute top-0 left-1/2 -translate-x-1/2 z-10 text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full text-white flex items-center gap-1 whitespace-nowrap"
                    style={{ background: '#111827', border: '1px solid #ffffff' }}
                >
                    <Gift size={10} />
                    {t.trialActive ? 'Brinde ativo' : 'Brinde'}
                </span>

                {t.trialActive && t.prepaid?.endsAt ? (
                    <div className="rounded-full px-5 pt-4 pb-3 text-center text-sm font-black text-white" style={{ background: GRADIENT, boxShadow: '0 8px 24px #f9731640' }}>
                        Ativo até {fmt(t.prepaid.endsAt)}
                        {left != null && ` — faltam ${left} ${left === 1 ? 'dia' : 'dias'}`}
                    </div>
                ) : t.trialEnded && t.claim ? (
                    <div className="rounded-3xl px-5 pt-4 pb-3 text-center text-xs font-bold text-white" style={{ background: 'rgba(17,24,39,0.8)' }}>
                        Você já resgatou o brinde (de {fmt(t.claim.claimed_at)} a {fmt(t.claim.ends_at)}). Pra continuar sem taxa por serviço, assine o Pré-pago.
                    </div>
                ) : (
                    <button
                        onClick={startClaim}
                        disabled={t.claiming}
                        className="gift-pulse w-full flex items-center justify-center gap-2 px-5 pt-4 pb-3 rounded-full text-sm font-black text-white active:scale-95 disabled:opacity-60"
                        style={{ background: GRADIENT, boxShadow: '0 8px 24px #f9731650' }}
                    >
                        {t.claiming ? <Spinner size={16} color="#ffffff" /> : <Gift size={16} />}
                        {t.userId ? `Resgatar ${daysLabel} de Plano Pré-pago` : `Entrar pra resgatar ${daysLabel} de Plano Pré-pago`}
                    </button>
                )}
            </div>

            {/* Pulso suave pra chamar atenção pro brinde (um respiro de escala + um anel de luz que se expande) */}
            <style>{`
                @keyframes giftPulse {
                    0%, 100% { transform: scale(1); box-shadow: 0 8px 24px #f9731650, 0 0 0 0 rgba(249,115,22,0.55); }
                    50% { transform: scale(1.025); box-shadow: 0 10px 28px #f9731680, 0 0 0 10px rgba(249,115,22,0); }
                }
                .gift-pulse { animation: giftPulse 2s ease-in-out infinite; }
                .gift-pulse:hover { animation-play-state: paused; transform: scale(1.03); }
                @media (prefers-reduced-motion: reduce) { .gift-pulse { animation: none; } }
            `}</style>

            {confirmOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-2xl p-6 relative" style={{ background: colors.surface }}>
                        <button onClick={() => setConfirmOpen(false)} className="absolute top-4 right-4" style={{ color: colors.textSecondary }} aria-label="Fechar">
                            <X size={20} />
                        </button>
                        <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: GRADIENT, color: '#fff' }}>
                            <Gift size={24} />
                        </div>
                        <p className="font-black text-base mb-1" style={{ color: colors.textPrimary }}>Ativar os {daysLabel} grátis?</p>
                        <p className="text-sm mb-2" style={{ color: colors.textPrimary }}>
                            Tem certeza que quer ativar os {daysLabel} grátis a partir de agora?
                        </p>
                        <div className="flex flex-col gap-2.5 mb-3">
                            {[
                                {
                                    icon: Store,
                                    title: 'Taxa 0% na loja',
                                    text: 'No pós-pago a loja paga R$ 0,50 por venda, R$ 0,50 por produto cadastrado e R$ 0,50 por publicação. Durante o brinde você vende, cadastra e publica à vontade, sem pagar nada por isso.',
                                },
                                {
                                    icon: Car,
                                    title: 'Taxa 0% no motorista',
                                    text: 'Cada corrida finalizada custa R$ 0,50 no pós-pago. Com o brinde você faz quantas corridas quiser e fica com tudo, sem a taxa por corrida.',
                                },
                                {
                                    icon: Wrench,
                                    title: 'Taxa 0% em serviços',
                                    text: 'Publicar um serviço, no perfil ou na loja, custa R$ 0,50, e se inscrever num pedido também gera taxa. Durante o brinde você publica e se inscreve sem pagar nada.',
                                },
                            ].map(({ icon: Icon, title, text }) => (
                                <div key={title} className="flex items-start gap-2.5 rounded-xl p-2.5" style={{ background: `${colors.border}20`, border: `1px solid ${colors.border}` }}>
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT }}>
                                        <Icon size={15} color="#fff" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-black" style={{ color: colors.textPrimary }}>{title}</p>
                                        <p className="text-[11px] leading-snug mt-0.5" style={{ color: colors.textSecondary }}>{text}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="text-[11px] mb-2" style={{ color: colors.textSecondary }}>
                            Exceção: as mensagens do bot de WhatsApp além da cota gratuita da Meta continuam cobradas à parte (R$ 0,25 por mensagem), porque é custo da Meta.
                        </p>
                        <p className="text-xs mb-4" style={{ color: colors.textSecondary }}>
                            O tempo começa a contar hoje, {fmt(new Date())}, e vai até {fmt(end)}. O resgate é único: depois de ativar, não dá pra pausar nem resgatar de novo.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setConfirmOpen(false)}
                                className="flex-1 py-2.5 rounded-xl font-bold text-sm"
                                style={{ background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                            >
                                Agora não
                            </button>
                            <button
                                onClick={() => { setConfirmOpen(false); doClaim() }}
                                disabled={t.claiming}
                                className="flex-1 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60 flex items-center justify-center"
                                style={{ background: GRADIENT, color: '#fff' }}
                            >
                                {t.claiming ? <Spinner size={14} color="#ffffff" /> : 'Sim, ativar agora'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {cpfOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="w-full max-w-sm rounded-2xl p-6 relative" style={{ background: colors.surface }}>
                        <button onClick={() => { setCpfOpen(false); setCpfInput('') }} className="absolute top-4 right-4" style={{ color: colors.textSecondary }} aria-label="Fechar">
                            <X size={20} />
                        </button>
                        <p className="font-black text-sm mb-1" style={{ color: colors.textPrimary }}>Falta seu CPF ou CNPJ</p>
                        <p className="text-xs mb-4" style={{ color: colors.textSecondary }}>
                            Usamos pra garantir que cada pessoa resgate o brinde uma única vez. Só pede uma vez.
                        </p>
                        <input
                            type="text"
                            inputMode="numeric"
                            value={cpfInput}
                            onChange={(e) => setCpfInput(e.target.value)}
                            placeholder="Só números"
                            className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none mb-3"
                            style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                        />
                        <button
                            onClick={confirmCpf}
                            disabled={t.claiming}
                            className="w-full py-2.5 rounded-xl font-bold text-sm disabled:opacity-60"
                            style={{ background: GRADIENT, color: '#fff' }}
                        >
                            {t.claiming ? <Spinner size={14} color="#ffffff" /> : 'Resgatar'}
                        </button>
                    </div>
                </div>
            )}
        </>
    )
}
