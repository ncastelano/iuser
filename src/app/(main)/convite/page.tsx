// app/(auth)/register/page.tsx

'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Loader2, UserPlus, Mail, Lock, User, ArrowRight, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

function RegisterContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const ref = searchParams.get('ref') // Pega o profileSlug do convite

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [inviterName, setInviterName] = useState<string | null>(null)

    // Estados do formulário
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')

    // Buscar nome do convidante
    useEffect(() => {
        const fetchInviter = async () => {
            if (!ref) return

            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('name')
                    .eq('profileSlug', ref)
                    .maybeSingle()

                if (data && !error) {
                    setInviterName(data.name)
                }
            } catch (error) {
                console.error('Erro ao buscar convidante:', error)
            }
        }

        fetchInviter()
    }, [ref])

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        // Validações básicas
        if (password !== confirmPassword) {
            setError('As senhas não coincidem')
            setLoading(false)
            return
        }

        if (password.length < 6) {
            setError('A senha deve ter pelo menos 6 caracteres')
            setLoading(false)
            return
        }

        try {
            // 1. Criar usuário no Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        name: name,
                    },
                },
            })

            if (authError) {
                setError(authError.message)
                setLoading(false)
                return
            }

            if (!authData.user) {
                setError('Erro ao criar usuário')
                setLoading(false)
                return
            }

            // 2. Criar perfil no Supabase
            const profileSlug = name.toLowerCase().replace(/\s/g, '') + Math.random().toString(36).slice(2, 6)

            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: authData.user.id,
                    name: name,
                    email: email,
                    profileSlug: profileSlug,
                    upline_id: ref ? await getUplineId(ref) : null,
                })

            if (profileError) {
                console.error('Erro ao criar perfil:', profileError)
                // Tentar excluir o usuário criado
                await supabase.auth.admin.deleteUser(authData.user.id)
                setError('Erro ao criar perfil. Tente novamente.')
                setLoading(false)
                return
            }

            toast.success('🎉 Conta criada com sucesso!')

            // Redirecionar para o dashboard
            setTimeout(() => {
                router.push('/dashboard')
            }, 1000)

        } catch (error: any) {
            console.error('Erro no registro:', error)
            setError(error.message || 'Erro ao criar conta')
        } finally {
            setLoading(false)
        }
    }

    // Função auxiliar para buscar o ID do upline
    const getUplineId = async (profileSlug: string): Promise<string | null> => {
        const { data, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('profileSlug', profileSlug)
            .maybeSingle()

        if (error || !data) return null
        return data.id
    }

    return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-neutral-900/80 backdrop-blur-sm border border-neutral-800 rounded-3xl p-8 shadow-2xl">
                {/* Cabeçalho */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
                        <UserPlus className="w-8 h-8 text-blue-400" />
                    </div>
                    <h1 className="text-2xl font-bold">Criar Conta</h1>
                    {inviterName && (
                        <p className="text-sm text-blue-400 mt-1">
                            Convidado por <span className="font-bold">{inviterName}</span>
                        </p>
                    )}
                    {ref && !inviterName && (
                        <p className="text-sm text-yellow-400 mt-1">
                            Você foi convidado(a) para o iUser!
                        </p>
                    )}
                </div>

                {/* Formulário */}
                <form onSubmit={handleRegister} className="space-y-4">
                    {/* Nome */}
                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-1">
                            Nome completo
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Seu nome"
                                required
                                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none transition-colors"
                            />
                        </div>
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-1">
                            E-mail
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="seu@email.com"
                                required
                                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none transition-colors"
                            />
                        </div>
                    </div>

                    {/* Senha */}
                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-1">
                            Senha
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Mínimo 6 caracteres"
                                required
                                minLength={6}
                                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none transition-colors"
                            />
                        </div>
                    </div>

                    {/* Confirmar Senha */}
                    <div>
                        <label className="block text-sm font-medium text-neutral-300 mb-1">
                            Confirmar senha
                        </label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirme sua senha"
                                required
                                className="w-full bg-neutral-800/50 border border-neutral-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none transition-colors"
                            />
                        </div>
                    </div>

                    {/* Erro */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-red-400">{error}</p>
                        </div>
                    )}

                    {/* Botão */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-3 rounded-xl font-bold text-lg hover:from-blue-500 hover:to-blue-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Criando conta...
                            </>
                        ) : (
                            <>
                                Criar Conta <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </button>
                </form>

                {/* Link para login */}
                <p className="text-center text-sm text-neutral-400 mt-6">
                    Já tem uma conta?{' '}
                    <button
                        onClick={() => router.push('/login')}
                        className="text-blue-400 hover:text-blue-300 font-bold transition-colors"
                    >
                        Fazer login
                    </button>
                </p>

                {/* Rodapé */}
                <p className="text-xs text-neutral-600 text-center mt-6">
                    Ao criar uma conta, você concorda com os Termos de Uso e Política de Privacidade.
                </p>
            </div>
        </div>
    )
}

// 🔥 Página principal com Suspense
export default function RegisterPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-black text-white flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                    <p className="text-neutral-400">Carregando...</p>
                </div>
            </div>
        }>
            <RegisterContent />
        </Suspense>
    )
}