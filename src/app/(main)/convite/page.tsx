// app/(main)/convite/page.tsx

'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    Users,
    Link as LinkIcon,
    CheckCircle,
    ArrowRight,
    UserPlus,
    Copy,
    Check,
    Loader2,
    AlertTriangle,
    Home,
    Send
} from 'lucide-react'
import { toast } from 'sonner'

export default function ConvitePage() {
    const router = useRouter()
    const searchParams = useSearchParams()

    // Pega o profileSlug da URL: /convite?ref=joaosilva
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
                // 1. Buscar perfil do convidante
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

                // 2. Buscar usuário logado
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
            // Redirecionar para registro com o perfil do convidante
            const params = new URLSearchParams({
                ref: inviter.profileSlug
            })
            router.push(`/registro?${params.toString()}`)
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
            // Tentar usar a função RPC
            const { error } = await supabase.rpc('vincular_upline', {
                p_user_id: currentUser.id,
                p_upline_id: inviter.id
            })

            if (error) {
                // Fallback: atualizar diretamente
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

            // Redirecionar para o dashboard
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
        const link = window.location.href
        try {
            await navigator.clipboard.writeText(link)
            setCopied(true)
            toast.success('Link copiado!')
            setTimeout(() => setCopied(false), 3000)
        } catch {
            toast.error('Erro ao copiar link')
        }
    }

    // Estado de loading
    if (loading) {
        return (
            <div className="min-h-screen bg-black text-white flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                    <p className="text-neutral-400">Carregando convite...</p>
                </div>
            </div>
        )
    }

    // Se não tem profileSlug na URL
    if (!profileSlug) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center text-center p-4">
                <div className="w-20 h-20 rounded-full bg-neutral-800 flex items-center justify-center mb-6">
                    <Send className="w-10 h-10 text-neutral-600" />
                </div>
                <h1 className="text-2xl font-bold mb-3">Link de Convite</h1>
                <p className="text-neutral-400 max-w-sm mb-8">
                    Para aceitar um convite, você precisa de um link válido com o nome de quem te convidou.
                </p>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                    <div className="bg-neutral-800/50 border border-neutral-700 rounded-xl p-4 text-left">
                        <p className="text-xs text-neutral-500 mb-1">Exemplo:</p>
                        <code className="text-sm text-blue-400 font-mono">
                            iuser.com.br/convite?ref=joaosilva
                        </code>
                    </div>
                    <button
                        onClick={() => router.push('/')}
                        className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 transition-colors"
                    >
                        <Home className="w-4 h-4" />
                        Voltar ao Início
                    </button>
                </div>
            </div>
        )
    }

    // Se o convite é inválido
    if (error || !inviter) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center text-center p-4">
                <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
                <h1 className="text-2xl font-bold mb-2">Convite Inválido</h1>
                <p className="text-neutral-400">Este link de convite não existe ou expirou.</p>
                <button
                    onClick={() => router.push('/')}
                    className="mt-8 px-6 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-colors flex items-center gap-2"
                >
                    <Home className="w-4 h-4" />
                    Voltar ao Início
                </button>
            </div>
        )
    }

    const isSameUser = currentUser?.id === inviter.id

    return (
        <div className="min-h-screen bg-black text-white p-4 flex justify-center items-center">
            <div className="w-full max-w-md bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-3xl p-8 relative overflow-hidden shadow-2xl flex flex-col items-center text-center">
                {/* Fundo decorativo */}
                <div className="absolute top-0 w-full h-32 bg-gradient-to-b from-blue-900/20 to-transparent" />
                <div className="absolute bottom-0 w-full h-32 bg-gradient-to-t from-purple-900/10 to-transparent" />

                {/* Ícone do convite */}
                <div className="relative z-10 mb-4">
                    <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto border border-blue-500/30">
                        <LinkIcon className="w-8 h-8 text-blue-400" />
                    </div>
                </div>

                <h2 className="text-sm font-extrabold text-blue-400 uppercase tracking-widest mb-6 relative z-10">
                    Convite Exclusivo
                </h2>

                {/* Avatar do convidante */}
                <div className="w-24 h-24 rounded-full border-4 border-neutral-800 bg-neutral-800 flex items-center justify-center overflow-hidden mb-4 relative z-10 shadow-xl shadow-black">
                    {inviter.avatar_url ? (
                        <img
                            src={inviter.avatar_url}
                            className="w-full h-full object-cover"
                            alt={inviter.name}
                        />
                    ) : (
                        <span className="text-3xl font-bold text-neutral-500">
                            {inviter.name?.charAt(0) || '?'}
                        </span>
                    )}
                </div>

                <h1 className="text-2xl font-bold text-white mb-2 relative z-10">
                    Você foi convidado(a) por
                </h1>
                <p className="text-2xl font-bold text-blue-400 mb-6 relative z-10">
                    {inviter.name}
                </p>

                <p className="text-neutral-400 text-sm mb-8 relative z-10 max-w-xs">
                    Junte-se ao iUser e comece a construir sua própria rede de comissões. 🚀
                </p>

                {/* CASO 1: NÃO LOGADO */}
                {!currentUser && (
                    <button
                        onClick={handleJoinNotLogged}
                        disabled={actionLoading}
                        className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-4 rounded-xl font-bold text-lg hover:from-blue-500 hover:to-blue-400 transition-all flex items-center justify-center gap-2 relative z-10 shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {actionLoading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Processando...
                            </>
                        ) : (
                            <>
                                Criar Conta e Entrar <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </button>
                )}

                {/* CASO 2: LOGADO COMO O PRÓPRIO DONO */}
                {isSameUser && (
                    <div className="w-full bg-blue-500/10 border border-blue-500/20 p-5 rounded-xl flex flex-col items-center gap-3 relative z-10">
                        <CheckCircle className="w-8 h-8 text-blue-400" />
                        <h3 className="font-bold text-blue-100">Este é o seu link de convite!</h3>
                        <p className="text-sm text-blue-300/80 text-center">
                            Copie esta URL e envie para novos parceiros para que eles entrem na sua rede.
                        </p>
                        <button
                            onClick={handleCopyLink}
                            className="flex items-center gap-2 px-6 py-2 rounded-full bg-blue-500/20 hover:bg-blue-500/30 transition-colors"
                        >
                            {copied ? (
                                <>
                                    <Check className="w-4 h-4 text-green-400" />
                                    <span className="text-sm text-green-400">Copiado!</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-4 h-4 text-blue-400" />
                                    <span className="text-sm text-blue-400">Copiar Link</span>
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* CASO 3: LOGADO MAS CONTA DIFERENTE */}
                {currentUser && !isSameUser && (
                    <div className="w-full relative z-10">
                        {currentUser.upline_id ? (
                            <div className="w-full bg-neutral-800 border border-neutral-700 p-5 rounded-xl flex flex-col items-center gap-3 text-center">
                                <Users className="w-8 h-8 text-neutral-500" />
                                <h3 className="font-bold text-white">Você já tem uma rede</h3>
                                <p className="text-sm text-neutral-400">
                                    Sua conta atual já está conectada a um líder.
                                    Apenas contas isoladas ou novos cadastros podem aceitar convites.
                                </p>
                                <button
                                    onClick={() => router.push('/dashboard')}
                                    className="mt-2 text-blue-400 hover:text-blue-300 underline text-sm"
                                >
                                    Ir para meu Painel
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleBindNetwork}
                                disabled={actionLoading}
                                className="w-full bg-gradient-to-r from-purple-600 to-purple-500 text-white py-4 rounded-xl font-bold text-lg hover:from-purple-500 hover:to-purple-400 transition-all flex items-center justify-center gap-2 relative z-10 shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {actionLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Conectando...
                                    </>
                                ) : (
                                    <>
                                        <UserPlus className="w-5 h-5" /> Vincular minha conta
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}

                {/* Rodapé */}
                <p className="text-xs text-neutral-600 mt-6 relative z-10">
                    Ao entrar, você concorda com os Termos de Uso e Política de Privacidade.
                </p>
            </div>
        </div>
    )
}