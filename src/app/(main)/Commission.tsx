// app/(main)/convite/page.tsx - VERSÃO SIMPLES

'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import {
    Users,
    ArrowRight,
    CheckCircle2,
    Crown,
    Loader2,
    AlertTriangle,
    Copy,
    Check,
    UserPlus,
    Store,
    Zap,
    Sparkles,
    Compass,
    Star,
    Rocket,
} from 'lucide-react'
import { toast } from 'sonner'

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

function ConviteContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { colors } = useTheme()
    const profileSlug = searchParams.get('ref')

    const surfaceRgb = hexToRgb(colors.surface)

    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [inviter, setInviter] = useState<any>(null)
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [copied, setCopied] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const borderColor = colors.border
    const primaryParticle = accentColor
    const darkerAccent = colors.accentLight || accentColor

    useEffect(() => {
        const loadPageData = async () => {
            if (!profileSlug) {
                setLoading(false)
                return
            }

            try {
                // Buscar informações do convidante
                const { data: inviterData } = await supabase
                    .from('profiles')
                    .select('id, name, avatar_url, "profileSlug"')
                    .eq('profileSlug', profileSlug)
                    .maybeSingle()

                if (!inviterData) {
                    setError('Perfil não encontrado')
                    setLoading(false)
                    return
                }

                setInviter(inviterData)

                // Verificar se usuário está logado
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data: currentProfile } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', user.id)
                        .maybeSingle()

                    setCurrentUser(currentProfile)
                }
            } catch (error) {
                console.error('Erro:', error)
                setError('Erro ao carregar convite')
            } finally {
                setLoading(false)
            }
        }

        loadPageData()
    }, [profileSlug])

    const handleJoinNotLogged = async () => {
        setActionLoading(true)
        try {
            if (inviter?.profileSlug) {
                await fetch('/api/set-referral-cookie', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ referralSlug: inviter.profileSlug }),
                })
            }

            router.push(`/register?ref=${inviter.profileSlug}`)
        } catch (error) {
            console.error('Erro:', error)
            toast.error('Erro ao processar convite')
        } finally {
            setActionLoading(false)
        }
    }

    const handleBindNetwork = async () => {
        if (!currentUser || !inviter) return
        setActionLoading(true)

        try {
            // SIMPLES: atualizar apenas o upline_id
            const { error } = await supabase
                .from('profiles')
                .update({ upline_id: inviter.id })
                .eq('id', currentUser.id)

            if (error) {
                console.error('Erro ao vincular:', error)
                toast.error('Erro ao vincular')
                setActionLoading(false)
                return
            }

            toast.success(`🎉 Você agora faz parte da rede de ${inviter.name}!`)
            setTimeout(() => router.push('/dashboard'), 1500)
        } catch (error) {
            console.error('Erro:', error)
            toast.error('Erro ao processar convite')
        } finally {
            setActionLoading(false)
        }
    }

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            setCopied(true)
            toast.success('Link copiado!')
            setTimeout(() => setCopied(false), 3000)
        } catch {
            toast.error('Erro ao copiar link')
        }
    }

    if (loading) {
        return (
            <div className="relative flex flex-col min-h-screen pb-32" style={{ background: colors.background }}>
                <div className="relative z-10 flex-1 flex items-center justify-center px-4">
                    <div className="text-center">
                        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" style={{ color: accentColor }} />
                        <p className="text-sm" style={{ color: textSecondary }}>Carregando convite...</p>
                    </div>
                </div>
            </div>
        )
    }

    if (!profileSlug) {
        return (
            <div className="relative flex flex-col min-h-screen pb-32" style={{ background: colors.background }}>
                <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
                    <div className="w-full max-w-md rounded-3xl p-8 text-center" style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        backdropFilter: 'blur(12px)',
                        border: `1px solid ${borderColor}`,
                        boxShadow: colors.shadow,
                    }}>
                        <div className="relative z-10 flex justify-center mb-6">
                            <div className="absolute w-20 h-20 rounded-full blur-xl opacity-50 animate-[pulse_2s_ease-in-out_infinite]" style={{
                                background: `linear-gradient(135deg, ${primaryParticle}, ${darkerAccent})`,
                            }} />
                            <div className="w-20 h-20 rounded-full flex items-center justify-center relative ring-2 ring-white/80 ring-offset-2" style={{
                                background: `linear-gradient(135deg, ${primaryParticle}, ${darkerAccent})`,
                                boxShadow: `0 0 30px ${primaryParticle}66`,
                            }}>
                                <img src="/logotransparente.png" alt="iUser" className="h-10 w-10 object-contain rounded-full drop-shadow-lg relative z-20" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-black mb-3" style={{ color: textPrimary }}>Link de Convite</h1>
                        <p className="text-sm mb-8" style={{ color: textSecondary }}>
                            Para aceitar um convite, você precisa de um link válido com o nome de quem te convidou.
                        </p>
                        <button onClick={() => router.push('/')} className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02]" style={{
                            background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                            color: colors.accentText,
                            boxShadow: `0 4px 14px ${accentColor}40`,
                        }}>
                            <img src="/logotransparente.png" alt="iUser" className="h-5 w-5 object-contain rounded-full" />
                            Explorar iUser
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (error || !inviter) {
        return (
            <div className="relative flex flex-col min-h-screen pb-32" style={{ background: colors.background }}>
                <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
                    <div className="w-full max-w-md rounded-3xl p-8 text-center" style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        backdropFilter: 'blur(12px)',
                        border: `1px solid ${borderColor}`,
                        boxShadow: colors.shadow,
                    }}>
                        <AlertTriangle className="w-16 h-16 mx-auto mb-4" style={{ color: '#ef4444' }} />
                        <h1 className="text-2xl font-black mb-2" style={{ color: textPrimary }}>Convite Inválido</h1>
                        <p className="text-sm mb-8" style={{ color: textSecondary }}>Este link de convite não existe ou expirou.</p>
                        <button onClick={() => router.push('/')} className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02]" style={{
                            background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                            color: colors.accentText,
                            boxShadow: `0 4px 14px ${accentColor}40`,
                        }}>
                            <Compass className="w-4 h-4" />
                            Explorar iUser
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const isSameUser = currentUser?.id === inviter.id

    return (
        <div className="relative flex flex-col min-h-screen pb-32" style={{ background: colors.background }}>
            <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
                <div className="w-full max-w-md">
                    <div className="rounded-3xl p-8 flex flex-col gap-6" style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        backdropFilter: 'blur(12px)',
                        border: `1px solid ${borderColor}`,
                        boxShadow: colors.shadow,
                    }}>
                        {/* Logo */}
                        <div className="relative z-10 flex justify-center">
                            <div className="absolute w-20 h-20 rounded-full blur-xl opacity-50 animate-[pulse_2s_ease-in-out_infinite]" style={{
                                background: `linear-gradient(135deg, ${primaryParticle}, ${darkerAccent})`,
                            }} />
                            <div className="w-20 h-20 rounded-full flex items-center justify-center relative ring-2 ring-white/80 ring-offset-2" style={{
                                background: `linear-gradient(135deg, ${primaryParticle}, ${darkerAccent})`,
                                boxShadow: `0 0 30px ${primaryParticle}66`,
                            }}>
                                <img src="/logotransparente.png" alt="iUser" className="h-10 w-10 object-contain rounded-full drop-shadow-lg relative z-20" />
                            </div>
                        </div>

                        <div className="text-center">
                            <h1 className="text-2xl font-black" style={{ color: textPrimary }}>Convite Exclusivo</h1>
                            <p className="text-sm" style={{ color: textSecondary }}>Você foi convidado(a) para o iUser!</p>
                        </div>

                        {/* Card do convidante */}
                        <div className="rounded-2xl p-6 text-center" style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                            border: `1px solid ${borderColor}`,
                        }}>
                            <div className="w-20 h-20 rounded-full mx-auto mb-3 overflow-hidden" style={{
                                border: `3px solid ${accentColor}`,
                                boxShadow: `0 0 30px ${accentColor}30`,
                            }}>
                                {inviter.avatar_url ? (
                                    <img src={inviter.avatar_url} className="w-full h-full object-cover" alt={inviter.name} />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-3xl font-black" style={{ background: `${accentColor}20`, color: accentColor }}>
                                        {inviter.name?.charAt(0) || '?'}
                                    </div>
                                )}
                            </div>
                            <h2 className="text-xl font-bold" style={{ color: textPrimary }}>{inviter.name}</h2>
                            <p className="text-sm" style={{ color: textSecondary }}>@{inviter.profileSlug}</p>
                            <div className="mt-3 pt-3 border-t" style={{ borderColor: `${borderColor}30` }}>
                                <p className="text-xs" style={{ color: textSecondary }}>
                                    <span className="font-bold" style={{ color: accentColor }}>🔗 Convite exclusivo</span> — junte-se à rede de {inviter.name}
                                </p>
                            </div>
                        </div>

                        {/* CASO 1: NÃO LOGADO */}
                        {!currentUser && (
                            <button
                                onClick={handleJoinNotLogged}
                                disabled={actionLoading}
                                className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{
                                    background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                                    color: colors.accentText,
                                    boxShadow: `0 4px 14px ${accentColor}40`,
                                }}
                            >
                                {actionLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Processando...
                                    </>
                                ) : (
                                    <>
                                        <UserPlus className="w-4 h-4" />
                                        Criar Conta e Entrar
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        )}

                        {/* CASO 2: LOGADO COMO O PRÓPRIO DONO */}
                        {isSameUser && (
                            <div className="rounded-2xl p-6 text-center" style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px solid ${borderColor}`,
                            }}>
                                <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: accentColor }} />
                                <h3 className="font-bold" style={{ color: textPrimary }}>Este é o seu link de convite!</h3>
                                <p className="text-sm mt-1 mb-4" style={{ color: textSecondary }}>Copie esta URL e envie para novos parceiros.</p>
                                <button
                                    onClick={handleCopyLink}
                                    className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                                    style={{
                                        background: `${accentColor}20`,
                                        border: `1px solid ${accentColor}`,
                                        color: accentColor,
                                    }}
                                >
                                    {copied ? (
                                        <>
                                            <Check className="w-4 h-4" style={{ color: '#10b981' }} />
                                            <span style={{ color: '#10b981' }}>Copiado!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4" />
                                            Copiar Link
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {/* CASO 3: LOGADO MAS CONTA DIFERENTE */}
                        {currentUser && !isSameUser && (
                            <div className="space-y-4">
                                {currentUser.upline_id ? (
                                    <div className="rounded-2xl p-6 text-center" style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                        border: `1px solid ${borderColor}`,
                                    }}>
                                        <Users className="w-12 h-12 mx-auto mb-3" style={{ color: textSecondary }} />
                                        <h3 className="font-bold" style={{ color: textPrimary }}>Você já tem uma rede</h3>
                                        <p className="text-sm mt-1 mb-4" style={{ color: textSecondary }}>Sua conta atual já está conectada a um líder.</p>
                                        <button onClick={() => router.push('/dashboard')} className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.02]" style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                            border: `1px solid ${borderColor}`,
                                            color: textSecondary,
                                        }}>
                                            Ir para meu Painel
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleBindNetwork}
                                        disabled={actionLoading}
                                        className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{
                                            background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                                            color: colors.accentText,
                                            boxShadow: `0 4px 14px ${accentColor}40`,
                                        }}
                                    >
                                        {actionLoading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Conectando...
                                            </>
                                        ) : (
                                            <>
                                                <Users className="w-4 h-4" />
                                                Vincular minha conta
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Rodapé */}
                        <div className="text-center">
                            <p className="text-[10px]" style={{ color: textSecondary }}>
                                Ao entrar, você concorda com os{' '}
                                <a href="/termos" className="font-bold hover:underline" style={{ color: accentColor }}>
                                    Termos de Uso
                                </a>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function ConvitePage() {
    const { colors } = useTheme()

    return (
        <Suspense fallback={
            <div className="relative flex flex-col min-h-screen pb-32" style={{ background: colors.background }}>
                <div className="relative z-10 flex-1 flex items-center justify-center px-4">
                    <div className="text-center">
                        <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" style={{ color: colors.accent }} />
                        <p className="text-sm" style={{ color: colors.textSecondary }}>Carregando convite...</p>
                    </div>
                </div>
            </div>
        }>
            <ConviteContent />
        </Suspense>
    )
}