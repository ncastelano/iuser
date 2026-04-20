'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Users, Link as LinkIcon, CheckCircle, ArrowRight, UserPlus } from 'lucide-react'
import { setReferralCookieAndRedirect } from '@/app/actions/cookies'

export default function ConvitePage() {
    const params = useParams()
    const router = useRouter()
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug

    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [inviter, setInviter] = useState<any>(null)
    const [currentUser, setCurrentUser] = useState<any>(null)

    const supabase = createClient()

    useEffect(() => {
        const loadPageData = async () => {
            // 1. Fetch inviter info
            const { data: inviterData, error: inviterError } = await supabase
                .from('profiles')
                .select('id, name, avatar_url, profileSlug')
                .eq('profileSlug', profileSlug)
                .single()

            if (inviterError || !inviterData) {
                setLoading(false)
                return
            }
            setInviter(inviterData)

            // 2. Fetch logged in user
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data: currentProfile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single()

                setCurrentUser(currentProfile)
            }

            setLoading(false)
        }

        if (profileSlug) {
            loadPageData()
        }
    }, [profileSlug])

    const handleJoinNotLogged = async () => {
        setActionLoading(true)
        // Usa a Server Action criada para setar o cookie e redirecionar pra /register
        await setReferralCookieAndRedirect(inviter.profileSlug)
    }

    const handleBindNetwork = async () => {
        if (!currentUser || !inviter) return
        setActionLoading(true)

        // Atualiza o upline_id. Como fornecemos a trigger de UPDATE no banco, 
        // o path será devidamente atualizado.
        const { error } = await supabase.rpc('bind_upline', {
            p_user_id: currentUser.id,
            p_upline_id: inviter.id
        })

        if (error) {
            alert('Não foi possível entrar na rede. Erro: ' + error.message)
            setActionLoading(false)
            return
        }

        alert('Bem-vindo! Você agora faz parte da rede de ' + inviter.name)
        router.push('/financeiro')
    }

    if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Carregando convite...</div>

    if (!inviter) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center text-center p-4">
                <Users className="w-16 h-16 text-neutral-600 mb-4" />
                <h1 className="text-2xl font-bold mb-2">Convite Inválido</h1>
                <p className="text-neutral-400">Este link de convite não existe ou expirou.</p>
                <button onClick={() => router.push('/')} className="mt-8 text-white underline hover:text-neutral-300">Voltar ao Início</button>
            </div>
        )
    }

    const isSameUser = currentUser?.id === inviter.id

    return (
        <div className="min-h-screen bg-black text-white p-4 flex justify-center items-center">

            <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-8 relative overflow-hidden shadow-2xl flex flex-col items-center text-center">

                <div className="absolute top-0 w-full h-32 bg-gradient-to-b from-blue-900/20 to-transparent"></div>

                <h2 className="text-sm font-extrabold text-blue-400 uppercase tracking-widest mb-6 relative z-10 flex items-center gap-2">
                    <LinkIcon className="w-4 h-4" /> Convite Exclusivo
                </h2>

                <div className="w-24 h-24 rounded-full border-4 border-neutral-900 bg-neutral-800 flex items-center justify-center overflow-hidden mb-4 relative z-10 shadow-xl shadow-black">
                    {inviter.avatar_url ? (
                        <img src={inviter.avatar_url} className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-3xl font-bold text-neutral-500">{inviter.name?.charAt(0)}</span>
                    )}
                </div>

                <h1 className="text-2xl font-bold text-white mb-2 relative z-10">Você foi convidado(a) por <br /> {inviter.name}!</h1>
                <p className="text-neutral-400 text-sm mb-8 relative z-10">
                    Junte-se ao marketplace e comece a construir sua própria rede de comissões.
                </p>

                {/* CASO 1: NÃO LOGADO */}
                {!currentUser && (
                    <button
                        onClick={handleJoinNotLogged}
                        disabled={actionLoading}
                        className="w-full bg-white text-black py-4 rounded-xl font-bold text-lg hover:bg-neutral-200 transition-all flex items-center justify-center gap-2 relative z-10 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {actionLoading ? 'Processando...' : (
                            <>
                                Criar Conta e Entrar <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </button>
                )}

                {/* CASO 2: LOGADO COMO O PRÓPRIO DONO */}
                {isSameUser && (
                    <div className="w-full bg-blue-500/10 border border-blue-500/20 p-5 rounded-xl flex flex-col items-center gap-2 relative z-10">
                        <CheckCircle className="w-8 h-8 text-blue-400" />
                        <h3 className="font-bold text-blue-100">Este é o seu link!</h3>
                        <p className="text-sm text-blue-300/80">Copie a URL desta página e envie para novos parceiros para que eles entrem na sua rede.</p>
                    </div>
                )}

                {/* CASO 3: LOGADO MAS CONTA DIFERENTE */}
                {currentUser && !isSameUser && (
                    <div className="w-full relative z-10">
                        {currentUser.upline_id ? (
                            <div className="w-full bg-neutral-800 border border-neutral-700 p-5 rounded-xl flex flex-col items-center gap-2 text-center">
                                <Users className="w-8 h-8 text-neutral-500" />
                                <h3 className="font-bold text-white">Você já tem uma rede</h3>
                                <p className="text-sm text-neutral-400">A sua conta atual já está conectada a um líder. Apenas contas isoladas ou novos cadastros podem aceitar convites.</p>
                                <button onClick={() => router.push('/financeiro')} className="mt-4 text-white underline text-sm">Ir para meu Financeiro</button>
                            </div>
                        ) : (
                            <button
                                onClick={handleBindNetwork}
                                disabled={actionLoading}
                                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-4 rounded-xl font-bold text-lg hover:from-blue-500 hover:to-blue-400 transition-all flex items-center justify-center gap-2 relative z-10 shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                            >
                                {actionLoading ? 'Conectando...' : (
                                    <>
                                        <UserPlus className="w-5 h-5" /> Vincular minha conta
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}

            </div>
        </div>
    )
}
