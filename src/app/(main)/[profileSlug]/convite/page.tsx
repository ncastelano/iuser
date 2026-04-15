'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Users, Link as LinkIcon, CheckCircle, UserPlus } from 'lucide-react'

export default function ConvitePage() {
    const params = useParams()
    const router = useRouter()
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug

    const supabase = createClient()

    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [inviter, setInviter] = useState<any>(null)
    const [currentUser, setCurrentUser] = useState<any>(null)

    // REGISTER STATES
    const [name, setName] = useState('')
    const [profileSlugInput, setProfileSlugInput] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            const { data: inviterData } = await supabase
                .from('profiles')
                .select('*')
                .eq('profileSlug', profileSlug)
                .single()

            if (!inviterData) {
                setLoading(false)
                return
            }

            setInviter(inviterData)

            const { data: { user } } = await supabase.auth.getUser()

            if (user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', user.id)
                    .single()

                setCurrentUser(profile)
            }

            setLoading(false)
        }

        if (profileSlug) load()
    }, [profileSlug])

    // 🔥 REGISTER COM UPLINE DIRETO
    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        setActionLoading(true)
        setError(null)

        if (password !== confirmPassword) {
            setError('As senhas não coincidem')
            setActionLoading(false)
            return
        }

        if (!profileSlugInput || !/^[a-z0-9-]+$/.test(profileSlugInput)) {
            setError('Slug inválido')
            setActionLoading(false)
            return
        }

        // verificar slug
        const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('profileSlug', profileSlugInput)
            .single()

        if (existing) {
            setError('Este link já está em uso.')
            setActionLoading(false)
            return
        }

        // criar auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { name }
            }
        })

        if (authError) {
            setError(authError.message)
            setActionLoading(false)
            return
        }

        if (!authData.user) {
            setError('Erro ao criar usuário')
            setActionLoading(false)
            return
        }

        // 🔥 CRIA PERFIL DIRETO (SEM TRIGGER)
        const { error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: authData.user.id,
                name,
                profileSlug: profileSlugInput,
                upline_id: inviter.id
            })

        if (profileError) {
            console.error(profileError)
            setError('Erro ao criar perfil: ' + profileError.message)
            setActionLoading(false)
            return
        }

        router.push('/dashboard')
    }

    const handleBind = async () => {
        setActionLoading(true)

        const { error } = await supabase.rpc('bind_upline', {
            p_user_id: currentUser.id,
            p_upline_id: inviter.id
        })

        if (error) {
            alert(error.message)
            setActionLoading(false)
            return
        }

        router.push('/dashboard')
    }

    if (loading) {
        return <div className="min-h-screen bg-black text-white flex items-center justify-center">Carregando...</div>
    }

    if (!inviter) {
        return <div className="text-white text-center mt-20">Convite inválido</div>
    }

    const isSameUser = currentUser?.id === inviter.id

    return (
        <div className="flex items-center justify-center min-h-screen bg-black px-4 py-12">

            <div className="w-full max-w-md">

                {/* HEADER CONVITE */}
                <div className="mb-6 text-center">
                    <h2 className="text-blue-400 text-sm font-bold flex justify-center items-center gap-2 mb-2">
                        <LinkIcon size={16} /> Convite
                    </h2>
                    <h1 className="text-xl font-bold">
                        {inviter.name} te convidou
                    </h1>
                </div>

                {/* LOGADO */}
                {currentUser && (
                    <>
                        {isSameUser && (
                            <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl text-center">
                                <CheckCircle className="mx-auto mb-2" />
                                Esse é seu próprio link
                            </div>
                        )}

                        {!isSameUser && (
                            <>
                                {currentUser.upline_id ? (
                                    <div className="bg-neutral-800 p-4 rounded-xl text-center">
                                        Você já está em uma rede
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleBind}
                                        className="w-full bg-blue-500 py-4 rounded-xl font-bold mt-4"
                                    >
                                        {actionLoading ? 'Conectando...' : 'Entrar na rede'}
                                    </button>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* REGISTER */}
                {!currentUser && (
                    <form onSubmit={handleRegister} className="w-full p-8 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl">

                        <h1 className="mb-6 text-2xl text-center">
                            Criar conta no <b>iUser</b>
                        </h1>

                        {error && <div className="mb-4 text-red-500 text-sm">{error}</div>}

                        <input
                            placeholder="Nome completo"
                            className="w-full p-3 mb-4 bg-neutral-950 rounded-xl"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />

                        <div className="flex mb-4 bg-neutral-950 rounded-xl overflow-hidden">
                            <span className="pl-3 pr-1 text-neutral-500 flex items-center">
                                iuser.com.br/
                            </span>
                            <input
                                className="w-full p-3 bg-transparent"
                                value={profileSlugInput}
                                onChange={(e) =>
                                    setProfileSlugInput(
                                        e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                                    )
                                }
                            />
                        </div>

                        <input
                            placeholder="Email"
                            className="w-full p-3 mb-4 bg-neutral-950 rounded-xl"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />

                        <input
                            type="password"
                            placeholder="Senha"
                            className="w-full p-3 mb-4 bg-neutral-950 rounded-xl"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />

                        <input
                            type="password"
                            placeholder="Confirmar senha"
                            className="w-full p-3 mb-6 bg-neutral-950 rounded-xl"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />

                        <button
                            type="submit"
                            disabled={actionLoading}
                            className="w-full bg-white text-black py-4 rounded-xl font-bold"
                        >
                            {actionLoading ? 'Criando...' : 'Criar conta e entrar'}
                        </button>

                    </form>
                )}

            </div>
        </div>
    )
}
