// app/(main)/convite/page.tsx

'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    User,
    Link as LinkIcon,
    ArrowRight,
    CheckCircle2,
    Store,
    Zap,
    Sparkles,
    Users,
    Copy,
    Check,
    Loader2,
    AlertTriangle,
    Home,
    Send,
    Mail,
    Crown
} from 'lucide-react'
import { BottomNav } from '@/components/BottomNav'
import AnimatedBackground from '@/components/AnimatedBackground'
import { toast } from 'sonner'

function ConviteContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const profileSlug = searchParams.get('ref')

    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [inviter, setInviter] = useState<any>(null)
    const [currentUser, setCurrentUser] = useState<any>(null)
    const [copied, setCopied] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadPageData = async () => {
            if (!profileSlug) {
                setLoading(false)
                return
            }

            try {
                const { data: inviterData, error: inviterError } = await supabase
                    .from('profiles')
                    .select('id, name, avatar_url, "profileSlug"')
                    .eq('profileSlug', profileSlug)
                    .maybeSingle()

                if (inviterError || !inviterData) {
                    setError('Perfil não encontrado')
                    setLoading(false)
                    return
                }
                setInviter(inviterData)

                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data: currentProfile } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', user.id)
                        .single()

                    setCurrentUser(currentProfile)
                }
            } catch (error) {
                console.error('Erro ao carregar página:', error)
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
            // 🔥 Redireciona para /register com o ref
            const params = new URLSearchParams({
                ref: inviter.profileSlug
            })
            router.push(`/register?${params.toString()}`)
        } catch (error) {
            console.error('Erro ao redirecionar:', error)
            toast.error('Erro ao processar convite')
        } finally {
            setActionLoading(false)
        }
    }

    const handleBindNetwork = async () => {
        if (!currentUser || !inviter) return
        setActionLoading(true)

        try {
            const { error } = await supabase.rpc('vincular_upline', {
                p_user_id: currentUser.id,
                p_upline_id: inviter.id
            })

            if (error) {
                const { error: updateError } = await supabase
                    .from('profiles')
                    .update({ upline_id: inviter.id })
                    .eq('id', currentUser.id)

                if (updateError) {
                    console.error('Erro ao vincular:', updateError)
                    toast.error('Não foi possível entrar na rede: ' + updateError.message)
                    setActionLoading(false)
                    return
                }
            }

            toast.success(`🎉 Bem-vindo! Você agora faz parte da rede de ${inviter.name}!`)

            setTimeout(() => {
                router.push('/dashboard')
            }, 1500)
        } catch (error) {
            console.error('Erro ao vincular:', error)
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
            <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
                <AnimatedBackground />
                <div className="relative z-10 flex-1 flex items-center justify-center px-4">
                    <div className="text-center">
                        <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
                        <p className="text-sm text-gray-600">Carregando convite...</p>
                    </div>
                </div>
                <BottomNav />
            </div>
        )
    }

    // Sem profileSlug na URL
    if (!profileSlug) {
        return (
            <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
                <AnimatedBackground />
                <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
                    <div className="w-full max-w-md text-center">
                        <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-xl mb-6">
                            <Send className="w-10 h-10 text-white" />
                        </div>
                        <h1 className="text-2xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-3">
                            Link de Convite
                        </h1>
                        <p className="text-sm text-gray-600 max-w-sm mx-auto mb-8">
                            Para aceitar um convite, você precisa de um link válido com o nome de quem te convidou.
                        </p>
                        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-orange-200/50 mb-6 text-left">
                            <p className="text-xs text-gray-500 mb-1">Exemplo:</p>
                            <code className="text-sm text-orange-600 font-mono">
                                iuser.com.br/convite?ref=joaosilva
                            </code>
                        </div>
                        <button
                            onClick={() => router.push('/')}
                            className="group w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:shadow-lg hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Home className="w-4 h-4" />
                            Voltar ao Início
                        </button>
                    </div>
                </div>
                <BottomNav />
            </div>
        )
    }

    // Convite inválido
    if (error || !inviter) {
        return (
            <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
                <AnimatedBackground />
                <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
                    <div className="w-full max-w-md text-center">
                        <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-black bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent mb-2">
                            Convite Inválido
                        </h1>
                        <p className="text-sm text-gray-600 mb-8">
                            Este link de convite não existe ou expirou.
                        </p>
                        <button
                            onClick={() => router.push('/')}
                            className="group w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:shadow-lg hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Home className="w-4 h-4" />
                            Voltar ao Início
                        </button>
                    </div>
                </div>
                <BottomNav />
            </div>
        )
    }

    const isSameUser = currentUser?.id === inviter.id

    return (
        <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
            <AnimatedBackground />

            <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
                <div className="w-full max-w-md">
                    {/* Logo */}
                    <div className="text-center mb-8">
                        <div className="flex justify-center mb-4">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-xl mx-auto">
                                <Users className="w-10 h-10 text-white" />
                            </div>
                        </div>

                        <h1 className="text-3xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-2">
                            Convite Exclusivo
                        </h1>
                        <p className="text-sm text-gray-600">
                            Você foi convidado(a) para o iUser!
                        </p>

                        {/* Feature badges */}
                        <div className="flex items-center justify-center gap-4 mt-4">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-600 bg-orange-100 px-3 py-1 rounded-full">
                                <Store className="w-3 h-3" />
                                <span>Sua loja</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-100 px-3 py-1 rounded-full">
                                <Zap className="w-3 h-3" />
                                <span>Venda em tempo real</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-yellow-600 bg-yellow-100 px-3 py-1 rounded-full">
                                <Sparkles className="w-3 h-3" />
                                <span>Grátis</span>
                            </div>
                        </div>
                    </div>

                    {/* Card do convidante */}
                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-orange-200/50 text-center mb-6">
                        <div className="w-20 h-20 rounded-full border-4 border-orange-200 bg-orange-100 flex items-center justify-center overflow-hidden mx-auto mb-3 shadow-lg">
                            {inviter.avatar_url ? (
                                <img
                                    src={inviter.avatar_url}
                                    className="w-full h-full object-cover"
                                    alt={inviter.name}
                                />
                            ) : (
                                <span className="text-3xl font-bold text-orange-500">
                                    {inviter.name?.charAt(0) || '?'}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center justify-center gap-2 mb-1">
                            <h2 className="text-xl font-bold text-gray-800">
                                {inviter.name}
                            </h2>
                            <Crown className="w-4 h-4 text-orange-500" />
                        </div>

                        <p className="text-sm text-gray-500">
                            @{inviter.profileSlug}
                        </p>

                        <div className="mt-3 pt-3 border-t border-orange-200/30">
                            <p className="text-xs text-gray-500">
                                <span className="font-bold text-orange-600">🔗 Convite exclusivo</span> — junte-se à rede de {inviter.name}
                            </p>
                        </div>
                    </div>

                    {/* CASO 1: NÃO LOGADO */}
                    {!currentUser && (
                        <button
                            onClick={handleJoinNotLogged}
                            disabled={actionLoading}
                            className="group w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {actionLoading ? (
                                <div className="flex items-center justify-center gap-2">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Processando...
                                </div>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    Criar Conta e Entrar
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </span>
                            )}
                        </button>
                    )}

                    {/* CASO 2: LOGADO COMO O PRÓPRIO DONO */}
                    {isSameUser && (
                        <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-orange-200/50 text-center">
                            <CheckCircle2 className="w-12 h-12 text-orange-500 mx-auto mb-3" />
                            <h3 className="text-lg font-bold text-gray-800 mb-1">
                                Este é o seu link de convite!
                            </h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Copie esta URL e envie para novos parceiros.
                            </p>
                            <button
                                onClick={handleCopyLink}
                                className="flex items-center justify-center gap-2 w-full py-3 bg-orange-100 hover:bg-orange-200 text-orange-700 font-bold rounded-xl transition-colors"
                            >
                                {copied ? (
                                    <>
                                        <Check className="w-4 h-4 text-green-500" />
                                        <span className="text-green-500">Copiado!</span>
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
                                <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-6 border border-orange-200/50 text-center">
                                    <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                                    <h3 className="text-lg font-bold text-gray-800 mb-1">
                                        Você já tem uma rede
                                    </h3>
                                    <p className="text-sm text-gray-600 mb-4">
                                        Sua conta atual já está conectada a um líder.
                                        Apenas contas isoladas podem aceitar convites.
                                    </p>
                                    <button
                                        onClick={() => router.push('/dashboard')}
                                        className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
                                    >
                                        Ir para meu Painel
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={handleBindNetwork}
                                    disabled={actionLoading}
                                    className="group w-full bg-gradient-to-r from-purple-500 to-orange-500 text-white py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {actionLoading ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Conectando...
                                        </div>
                                    ) : (
                                        <span className="flex items-center justify-center gap-2">
                                            <Users className="w-4 h-4" />
                                            Vincular minha conta
                                        </span>
                                    )}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Divisor e mensagem adicional */}
                    <div className="mt-6 pt-4 border-t border-orange-200/30">
                        <div className="bg-white/40 backdrop-blur-sm rounded-2xl p-4 border border-orange-200/30">
                            <p className="text-[11px] text-gray-600 text-center leading-relaxed">
                                ✨ <span className="font-black text-orange-600">Construa sua rede</span> de indicações<br />
                                e ganhe comissões com cada novo membro.
                            </p>
                        </div>
                    </div>

                    {/* Botão voltar */}
                    <button
                        onClick={() => router.push('/')}
                        className="mt-4 w-full py-3 bg-white/50 backdrop-blur-sm border border-orange-200/50 text-gray-600 rounded-xl font-bold text-sm transition-all hover:bg-white/80 flex items-center justify-center gap-2"
                    >
                        <Home className="w-4 h-4" />
                        Voltar ao Início
                    </button>

                    {/* Rodapé */}
                    <div className="mt-6 text-center">
                        <p className="text-[10px] text-gray-500">
                            Ao entrar, você concorda com os{' '}
                            <a href="/termos" className="font-bold text-orange-600 hover:underline">
                                Termos de Uso
                            </a>
                        </p>
                    </div>
                </div>
            </div>

            <BottomNav />
        </div>
    )
}

// 🔥 Página principal com Suspense
export default function ConvitePage() {
    return (
        <Suspense fallback={
            <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
                <AnimatedBackground />
                <div className="relative z-10 flex-1 flex items-center justify-center px-4">
                    <div className="text-center">
                        <Loader2 className="w-12 h-12 text-orange-500 animate-spin mx-auto mb-4" />
                        <p className="text-sm text-gray-600">Carregando convite...</p>
                    </div>
                </div>
                <BottomNav />
            </div>
        }>
            <ConviteContent />
        </Suspense>
    )
}