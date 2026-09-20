// app/(main)/convite/page.tsx

'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { hexToRgb } from '@/lib/color'
import {
    Users,
    Link as LinkIcon,
    ArrowRight,
    CheckCircle2,
    Crown,
    AlertTriangle,
    Home,
    Send,
    Copy,
    Check,
    UserPlus,
    Store,
    Zap,
    Sparkles,
    Compass,
    Star,
    Shield,
    Rocket,
    TrendingUp,
} from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'

function ConviteContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { colors } = useTheme()
    const { userId, loading: profileLoading } = useProfile()
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


    useEffect(() => {
        if (profileLoading) return

        const loadPageData = async () => {
            console.log('🔍 Carregando página de convite...')
            console.log('📝 ProfileSlug da URL:', profileSlug)

            if (!profileSlug) {
                console.log('ℹ️ Nenhum profileSlug na URL')
                setLoading(false)
                return
            }

            try {
                // Buscar informações do convidante
                console.log('🔍 Buscando convidante para o slug:', profileSlug)

                const { data: inviterData, error: inviterError } = await supabase
                    .from('profiles')
                    .select('id, name, avatar_url, "profileSlug"')
                    .eq('profileSlug', profileSlug)
                    .maybeSingle()

                if (inviterError) {
                    console.error('❌ Erro ao buscar convidante:', inviterError)
                    setError('Erro ao carregar convite')
                    setLoading(false)
                    return
                }

                if (!inviterData) {
                    console.warn('⚠️ Convidante não encontrado para o slug:', profileSlug)
                    setError('Perfil não encontrado')
                    setLoading(false)
                    return
                }

                console.log('✅ Convidante encontrado:', inviterData.name, inviterData.id)
                setInviter(inviterData)

                // Verificar se o usuário está logado
                if (userId) {
                    console.log('👤 Usuário logado:', userId)

                    const { data: currentProfile, error: profileError } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', userId)
                        .maybeSingle()

                    if (profileError) {
                        console.error('❌ Erro ao buscar perfil do usuário:', profileError)
                    }

                    if (currentProfile) {
                        console.log('✅ Perfil do usuário encontrado:', currentProfile.name)
                        setCurrentUser(currentProfile)
                    } else {
                        console.warn('⚠️ Perfil do usuário não encontrado para o ID:', userId)
                        setCurrentUser(null)
                    }
                } else {
                    console.log('ℹ️ Usuário não está logado')
                }

            } catch (error) {
                console.error('❌ Erro ao carregar página:', error)
                setError('Erro ao carregar convite')
            } finally {
                setLoading(false)
            }
        }

        loadPageData()
    }, [profileSlug, userId, profileLoading])

    // 🔥 FUNÇÃO ATUALIZADA: Salvar cookie antes de redirecionar
    const handleJoinNotLogged = async () => {
        console.log('🚀 handleJoinNotLogged iniciado')
        setActionLoading(true)

        try {
            // 1. Salvar o cookie com o slug do convite
            if (inviter?.profileSlug) {
                console.log('📝 Salvando cookie para o slug:', inviter.profileSlug)

                const response = await fetch('/api/set-referral-cookie', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        referralSlug: inviter.profileSlug
                    }),
                })

                if (!response.ok) {
                    const errorData = await response.json()
                    console.error('❌ Erro ao salvar cookie:', errorData)
                    toast.error('Erro ao processar convite')
                    setActionLoading(false)
                    return
                }

                console.log('✅ Cookie salvo com sucesso:', inviter.profileSlug)
            } else {
                console.warn('⚠️ Inviter sem profileSlug')
            }

            // 2. Redirecionar para o registro com o ref
            const params = new URLSearchParams({
                ref: inviter.profileSlug
            })
            const redirectUrl = `/cadastrar?${params.toString()}`
            console.log('🔀 Redirecionando para:', redirectUrl)

            router.push(redirectUrl)
        } catch (error) {
            console.error('❌ Erro ao redirecionar:', error)
            toast.error('Erro ao processar convite')
        } finally {
            setActionLoading(false)
        }
    }

    // 🔥 FUNÇÃO ATUALIZADA: Vincular usuário logado
    const handleBindNetwork = async () => {
        if (!currentUser || !inviter) {
            console.warn('⚠️ currentUser ou inviter não disponível')
            return
        }

        console.log('🔗 Vinculando usuário à rede...')
        console.log('👤 Usuário:', currentUser.id, currentUser.name)
        console.log('👤 Inviter:', inviter.id, inviter.name)

        setActionLoading(true)

        try {
            // Verificar se o usuário já tem upline
            if (currentUser.upline_id) {
                console.log('ℹ️ Usuário já tem upline:', currentUser.upline_id)
                toast.info('Você já está vinculado a uma rede')
                setActionLoading(false)
                return
            }

            // Usar a função do Supabase
            console.log('📡 Chamando RPC link_user_to_network...')

            const { data, error } = await supabase.rpc('link_user_to_network', {
                p_user_id: currentUser.id,
                p_upline_id: inviter.id
            })

            if (error) {
                console.error('❌ Erro ao vincular via RPC:', error)

                // Fallback: update direto
                console.log('🔄 Tentando fallback com update direto...')

                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({
                        upline_id: inviter.id,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', currentUser.id)

                if (updateError) {
                    console.error('❌ Erro ao vincular (fallback):', updateError)
                    toast.error('Não foi possível entrar na rede: ' + updateError.message)
                    setActionLoading(false)
                    return
                }

                console.log('✅ Vinculado via fallback!')
            } else {
                console.log('✅ Vinculado via RPC!', data)
            }

            toast.success(`🎉 Bem-vindo! Você agora faz parte da rede de ${inviter.name}!`)

            setTimeout(() => {
                router.push('/')
            }, 1500)

        } catch (error) {
            console.error('❌ Erro ao vincular:', error)
            toast.error('Erro ao processar convite')
        } finally {
            setActionLoading(false)
        }
    }

    const handleCopyLink = async () => {
        try {
            const link = window.location.href
            await navigator.clipboard.writeText(link)
            setCopied(true)
            toast.success('Link copiado!')
            setTimeout(() => setCopied(false), 3000)
        } catch {
            toast.error('Erro ao copiar link')
        }
    }

    // Carregando
    if (loading) {
        return (
            <div
                className="relative flex flex-col min-h-screen pb-32"
                style={{ background: colors.background }}
            >
                <div className="relative z-10 flex-1 flex items-center justify-center px-4">
                    <div className="text-center">
                        <Spinner size={48} color={accentColor} className="mx-auto mb-4" />
                        <p className="text-sm" style={{ color: textSecondary }}>
                            Carregando convite...
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    // Sem profileSlug na URL
    if (!profileSlug) {
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
                            WebkitBackdropFilter: 'blur(12px)',
                            border: `1px solid ${borderColor}`,
                            boxShadow: colors.shadow,
                        }}
                    >
                        {/* Logo com animação */}
                        <div className="relative z-10 flex justify-center mb-6">
                            <div
                                className="absolute w-20 h-20 rounded-full blur-xl opacity-50 animate-[pulse_2s_ease-in-out_infinite]"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                }}
                            />
                            <div
                                className="w-20 h-20 rounded-full flex items-center justify-center relative ring-2 ring-white/80 ring-offset-2 ring-offset-transparent"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                    boxShadow: '0 0 30px #f9731666, 0 0 60px #dc262633',
                                }}
                            >
                                <img
                                    src="/logotransparente.png"
                                    alt="iUser"
                                    className="h-10 w-10 object-contain rounded-full drop-shadow-lg relative z-20"
                                />
                            </div>
                        </div>

                        <h1 className="text-2xl font-black mb-3" style={{ color: textPrimary }}>
                            Link de Convite
                        </h1>
                        <p className="text-sm mb-8" style={{ color: textSecondary }}>
                            Para aceitar um convite, você precisa de um link válido com o nome de quem te convidou.
                        </p>
                        <div
                            className="rounded-2xl p-4 mb-6 text-left"
                            style={{
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                border: `1px solid ${borderColor}`,
                            }}
                        >
                            <p className="text-xs mb-1" style={{ color: textSecondary }}>Exemplo:</p>
                            <code className="text-sm font-mono" style={{ color: accentColor }}>
                                iuser.com.br/convite?ref=joaosilva
                            </code>
                        </div>

                        {/* Card "Conhecer o iUser" */}
                        <div
                            className="rounded-2xl p-6 mb-6 text-left transition-all hover:scale-[1.02] cursor-pointer"
                            style={{
                                background: `linear-gradient(135deg, ${accentColor}15, ${accentColor}05)`,
                                border: `1px solid ${accentColor}30`,
                            }}
                            onClick={() => router.push('/')}
                        >
                            <div className="flex items-start gap-4">
                                <div
                                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{
                                        background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                        color: colors.accentText,
                                    }}
                                >
                                    <img
                                        src="/logotransparente.png"
                                        alt="iUser"
                                        className="h-8 w-8 object-contain rounded-full drop-shadow-lg relative z-20"
                                    />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold" style={{ color: textPrimary }}>
                                        Conhecer o iUser
                                    </h4>
                                    <p className="text-xs mt-1" style={{ color: textSecondary }}>
                                        Descubra como o que outras pessoas tem a oferecer
                                    </p>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className="text-[10px] flex items-center gap-1" style={{ color: accentColor }}>
                                            <Rocket className="w-3 h-3" />
                                            Taxa 0%!
                                        </span>
                                        <span className="text-[10px] flex items-center gap-1" style={{ color: accentColor }}>
                                            <Star className="w-3 h-3" />
                                            +1000 lojas
                                        </span>
                                    </div>
                                </div>
                                <ArrowRight className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: accentColor }} />
                            </div>
                        </div>

                        <button
                            onClick={() => router.push('/')}
                            className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                            style={{
                                background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                color: colors.accentText,
                                boxShadow: `0 4px 14px ${accentColor}40`,
                            }}
                        >
                            <img
                                src="/logotransparente.png"
                                alt="iUser"
                                className="h-5 w-5 object-contain rounded-full drop-shadow-lg relative z-20"
                            />
                            Explorar iUser
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // Convite inválido
    if (error || !inviter) {
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
                            WebkitBackdropFilter: 'blur(12px)',
                            border: `1px solid ${borderColor}`,
                            boxShadow: colors.shadow,
                        }}
                    >
                        {/* Logo com animação */}
                        <div className="relative z-10 flex justify-center mb-6">
                            <div
                                className="absolute w-20 h-20 rounded-full blur-xl opacity-50 animate-[pulse_2s_ease-in-out_infinite]"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                }}
                            />
                            <div
                                className="w-20 h-20 rounded-full flex items-center justify-center relative ring-2 ring-white/80 ring-offset-2 ring-offset-transparent"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                    boxShadow: '0 0 30px #f9731666, 0 0 60px #dc262633',
                                }}
                            >
                                <img
                                    src="/logotransparente.png"
                                    alt="iUser"
                                    className="h-10 w-10 object-contain rounded-full drop-shadow-lg relative z-20"
                                />
                            </div>
                        </div>

                        <AlertTriangle className="w-16 h-16 mx-auto mb-4" style={{ color: '#ef4444' }} />
                        <h1 className="text-2xl font-black mb-2" style={{ color: textPrimary }}>
                            Convite Inválido
                        </h1>
                        <p className="text-sm mb-8" style={{ color: textSecondary }}>
                            Este link de convite não existe ou expirou.
                        </p>

                        <button
                            onClick={() => router.push('/')}
                            className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                            style={{
                                background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                color: colors.accentText,
                                boxShadow: `0 4px 14px ${accentColor}40`,
                            }}
                        >
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
                            WebkitBackdropFilter: 'blur(12px)',
                            border: `1px solid ${borderColor}`,
                            boxShadow: colors.shadow,
                        }}
                    >
                        {/* Foto de quem convidou, no lugar da logo genérica */}
                        <div className="relative z-10 flex justify-center">
                            <div
                                className="absolute w-24 h-24 rounded-full blur-xl opacity-50 animate-[pulse_2s_ease-in-out_infinite]"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                }}
                            />
                            <div
                                className="w-24 h-24 rounded-full flex items-center justify-center relative ring-2 ring-white/80 ring-offset-2 ring-offset-transparent overflow-hidden"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                    boxShadow: '0 0 30px #f9731666, 0 0 60px #dc262633',
                                }}
                            >
                                {inviter.avatar_url ? (
                                    <img
                                        src={inviter.avatar_url}
                                        alt={inviter.name}
                                        className="w-full h-full object-cover relative z-20"
                                    />
                                ) : (
                                    <span className="text-3xl font-black text-white relative z-20">
                                        {inviter.name?.charAt(0) || '?'}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="text-center">
                            <h1 className="text-2xl font-black" style={{ color: textPrimary }}>
                                {inviter.name}
                            </h1>
                            <p className="text-sm font-bold" style={{ color: accentColor }}>
                                @{inviter.profileSlug} te chamou para o iUser
                            </p>

                            {/* Feature badges */}
                            <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                                <div
                                    className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded-full"
                                    style={{
                                        background: `${accentColor}20`,
                                        color: accentColor,
                                    }}
                                >
                                    <Store className="w-3 h-3" />
                                    <span>Sua loja</span>
                                </div>
                                <div
                                    className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded-full"
                                    style={{
                                        background: `${accentColor}15`,
                                        color: accentColor,
                                    }}
                                >
                                    <Zap className="w-3 h-3" />
                                    <span>Venda em tempo real</span>
                                </div>
                                <div
                                    className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded-full"
                                    style={{
                                        background: `${accentColor}10`,
                                        color: accentColor,
                                    }}
                                >
                                    <Sparkles className="w-3 h-3" />
                                    <span>Taxa 0% no plano ou R$ 0,50 por transação</span>
                                </div>
                            </div>
                        </div>

                        {/* Chamada de impacto, reforçando quem está convidando */}
                        <div
                            className="rounded-2xl p-4 text-center flex items-center justify-center gap-2"
                            style={{
                                background: `${accentColor}12`,
                                border: `1px solid ${accentColor}30`,
                            }}
                        >
                            <Crown className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
                            <p className="text-xs font-bold" style={{ color: textPrimary }}>
                                Convite exclusivo — entre e faça parte da rede de {inviter.name}
                            </p>
                        </div>

                        {/* CASO 1: NÃO LOGADO */}
                        {!currentUser && (
                            <button
                                onClick={handleJoinNotLogged}
                                disabled={actionLoading}
                                className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{
                                    background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                    color: colors.accentText,
                                    boxShadow: `0 4px 14px ${accentColor}40`,
                                }}
                            >
                                {actionLoading ? (
                                    <>
                                        <Spinner size={16} />
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
                            <div
                                className="rounded-2xl p-6 text-center"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                    border: `1px solid ${borderColor}`,
                                }}
                            >
                                <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: accentColor }} />
                                <h3 className="font-bold" style={{ color: textPrimary }}>
                                    Este é o seu link de convite!
                                </h3>
                                <p className="text-sm mt-1 mb-4" style={{ color: textSecondary }}>
                                    Copie esta URL e envie para novos parceiros.
                                </p>
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
                                    <div
                                        className="rounded-2xl p-6 text-center"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                            border: `1px solid ${borderColor}`,
                                        }}
                                    >
                                        <Users className="w-12 h-12 mx-auto mb-3" style={{ color: textSecondary }} />
                                        <h3 className="font-bold" style={{ color: textPrimary }}>
                                            Você já tem uma rede
                                        </h3>
                                        <p className="text-sm mt-1 mb-4" style={{ color: textSecondary }}>
                                            Sua conta atual já está conectada a um líder.
                                            Apenas contas isoladas podem aceitar convites.
                                        </p>
                                        <button
                                            onClick={() => router.push('/')}
                                            className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:scale-[1.02]"
                                            style={{
                                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                                border: `1px solid ${borderColor}`,
                                                color: textSecondary,
                                            }}
                                        >
                                            voltar ao início
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleBindNetwork}
                                        disabled={actionLoading}
                                        className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{
                                            background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                            color: colors.accentText,
                                            boxShadow: `0 4px 14px ${accentColor}40`,
                                        }}
                                    >
                                        {actionLoading ? (
                                            <>
                                                <Spinner size={16} />
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

                        {/* Card "Conhecer o iUser" */}
                        <div
                            className="rounded-2xl p-4 text-left transition-all hover:scale-[1.02] cursor-pointer"
                            style={{
                                background: `linear-gradient(135deg, ${accentColor}10, ${accentColor}05)`,
                                border: `1px solid ${accentColor}20`,
                            }}
                            onClick={() => router.push('/')}
                        >
                            <div className="flex items-center gap-3">
                                <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{
                                        background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                        color: colors.accentText,
                                    }}
                                >
                                    <img
                                        src="/logotransparente.png"
                                        alt="iUser"
                                        className="h-6 w-6 object-contain rounded-full drop-shadow-lg relative z-20"
                                    />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-sm" style={{ color: textPrimary }}>
                                        Conhecer o iUser
                                    </h4>
                                    <p className="text-[10px]" style={{ color: textSecondary }}>
                                        Descubra como o que outras pessoas tem a oferecer
                                    </p>
                                </div>
                                <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: accentColor }} />
                            </div>
                        </div>

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

// Página principal com Suspense
export default function ConviteClientPage() {
    const { colors } = useTheme()

    return (
        <Suspense fallback={
            <div
                className="relative flex flex-col min-h-screen pb-32"
                style={{ background: colors.background }}
            >
                <div className="relative z-10 flex-1 flex items-center justify-center px-4">
                    <div className="text-center">
                        <Spinner size={48} color={colors.accent} className="mx-auto mb-4" />
                        <p className="text-sm" style={{ color: colors.textSecondary }}>
                            Carregando convite...
                        </p>
                    </div>
                </div>
            </div>
        }>
            <ConviteContent />
        </Suspense>
    )
}