// src/components/RecoverPassword.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { Mail, ArrowLeft, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

interface RecoverPasswordProps {
    onBack?: () => void
    onSuccess?: () => void
}

export default function RecoverPassword({ onBack, onSuccess }: RecoverPasswordProps) {
    const router = useRouter()
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [resendTimer, setResendTimer] = useState(0)

    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const borderColor = colors.border

    const handleRecover = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        if (!email) {
            setError('Digite seu e-mail para recuperar a senha.')
            setLoading(false)
            return
        }

        try {
            const { error: recoverError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/redefinir-senha`,
            })

            if (recoverError) {
                if (recoverError.message.includes('Email not confirmed')) {
                    setError('Este e-mail ainda não foi confirmado. Verifique sua caixa de entrada.')
                } else {
                    setError('Não foi possível enviar o e-mail de recuperação. Verifique se o e-mail está correto.')
                }
                setLoading(false)
                return
            }

            setSuccess(true)
            toast.success('📧 E-mail de recuperação enviado!')
            setResendTimer(60)

            // Timer para reenvio
            const interval = setInterval(() => {
                setResendTimer((prev) => {
                    if (prev <= 1) {
                        clearInterval(interval)
                        return 0
                    }
                    return prev - 1
                })
            }, 1000)

            // Se tiver callback de sucesso, executa após 3 segundos
            if (onSuccess) {
                setTimeout(() => {
                    onSuccess()
                }, 3000)
            }

        } catch (err: any) {
            setError('Ocorreu um erro inesperado. Tente novamente.')
            console.error('Erro na recuperação de senha:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleResend = async () => {
        if (resendTimer > 0) return
        await handleRecover({ preventDefault: () => { } } as React.FormEvent)
    }

    const handleBack = () => {
        if (onBack) {
            onBack()
        } else {
            router.back()
        }
    }

    // Tela de sucesso
    if (success) {
        return (
            <div
                className="relative flex flex-col min-h-screen pb-32"
                style={{ background: colors.background }}
            >
                <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
                    <div
                        className="w-full max-w-md rounded-3xl p-8 text-center"
                        style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                            backdropFilter: 'blur(12px)',
                            border: `1px solid ${borderColor}`,
                            boxShadow: colors.shadow,
                        }}
                    >
                        <div
                            className="w-20 h-20 mx-auto rounded-full flex items-center justify-center shadow-xl mb-4"
                            style={{
                                background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                color: '#ffffff',
                            }}
                        >
                            <CheckCircle2 className="w-10 h-10" />
                        </div>

                        <h2 className="text-2xl font-black mb-2" style={{ color: textPrimary }}>
                            E-mail enviado! 📧
                        </h2>
                        <p className="text-sm" style={{ color: textSecondary }}>
                            Enviamos um link de recuperação para:
                        </p>
                        <p className="text-sm font-bold mt-1" style={{ color: textPrimary }}>
                            {email}
                        </p>
                        <p className="text-xs mt-4" style={{ color: textSecondary }}>
                            Verifique sua caixa de entrada e também a pasta de spam.
                            O link expira em 1 hora.
                        </p>

                        <div className="flex flex-col gap-3 mt-6">
                            <button
                                onClick={handleResend}
                                disabled={resendTimer > 0}
                                className="w-full py-3.5 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] disabled:opacity-50"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    border: `2px solid ${borderColor}`,
                                    color: textSecondary,
                                }}
                            >
                                {resendTimer > 0 ? (
                                    `Reenviar em ${resendTimer}s`
                                ) : (
                                    'Reenviar e-mail'
                                )}
                            </button>

                            <button
                                onClick={handleBack}
                                className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                    color: '#ffffff',
                                    boxShadow: `0 4px 14px #f9731640`,
                                }}
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Voltar para o login
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // Tela principal de recuperação
    return (
        <div
            className="relative flex flex-col min-h-screen pb-32"
            style={{ background: colors.background }}
        >
            <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
                <div className="w-full max-w-md">
                    <div
                        className="rounded-3xl p-8 flex flex-col gap-6"
                        style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                            backdropFilter: 'blur(12px)',
                            border: `1px solid ${borderColor}`,
                            boxShadow: colors.shadow,
                        }}
                    >
                        {/* Logo e Título */}
                        <div className="text-center">
                            <div
                                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                    color: '#ffffff',
                                }}
                            >
                                <img src="/logotransparente.png" alt="iUser" className="w-12 h-12 object-contain" />
                            </div>

                            <h1 className="text-2xl font-black" style={{ color: textPrimary }}>
                                Recuperar senha
                            </h1>
                            <p className="text-sm" style={{ color: textSecondary }}>
                                Digite seu e-mail e enviaremos um link para redefinir sua senha.
                            </p>
                        </div>

                        <form onSubmit={handleRecover} className="space-y-5">
                            {error && (
                                <div
                                    className="p-3 text-xs font-bold rounded-xl flex items-start gap-2"
                                    style={{
                                        background: '#ef444420',
                                        border: `1px solid #ef444430`,
                                        color: '#ef4444',
                                    }}
                                >
                                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                                    <Mail className="w-3.5 h-3.5" style={{ color: accentColor }} />
                                    E-MAIL
                                </label>
                                <input
                                    type="email"
                                    className="w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none focus:ring-2"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                        border: `2px solid ${borderColor}`,
                                        color: textPrimary,
                                        '--tw-ring-color': accentColor,
                                    } as React.CSSProperties}
                                    placeholder="seu@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    disabled={loading}
                                />
                                <p className="text-[10px]" style={{ color: textSecondary }}>
                                    Digite o e-mail usado no seu cadastro.
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                    color: '#ffffff',
                                    boxShadow: `0 4px 14px #f9731640`,
                                }}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Enviando...
                                    </>
                                ) : (
                                    <>
                                        Enviar link de recuperação
                                    </>
                                )}
                            </button>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t" style={{ borderColor: `${borderColor}50` }} />
                                </div>
                                <div className="relative flex justify-center text-xs">
                                    <span
                                        className="px-2 text-[9px] font-bold"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                                            color: textSecondary,
                                        }}
                                    >
                                        Lembrou sua senha?
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleBack}
                                className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    border: `2px solid ${borderColor}`,
                                    color: textSecondary,
                                }}
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Voltar para o login
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    )
}