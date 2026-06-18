'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
    Mail,
    Lock,
    Eye,
    EyeOff,
    LogIn,
    Store,
    Sparkles,
} from 'lucide-react'
import { useTheme } from '@/app/theme'

interface LoginScreenProps {
    embedded?: boolean
    onBack?: () => void
    onSwitchToRegister?: () => void
}

export default function LoginScreen({
    embedded = false,
    onBack,
    onSwitchToRegister,
}: LoginScreenProps) {
    const { colors } = useTheme()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            })
            if (authError) throw authError

            onBack?.()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="relative z-10 max-w-md mx-auto px-4 py-6 w-full">
            {/* Título */}
            <div className="text-center mb-6">
                <h1 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent tracking-tighter">
                    Acesse sua conta
                </h1>

            </div>

            {/* Formulário */}
            <form
                onSubmit={handleLogin}
                className="bg-white/80 backdrop-blur-sm rounded-2xl border border-orange-200/50 p-6 space-y-5 shadow-sm"
            >
                {error && (
                    <div className="p-3 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl">
                        ⚠️ {error}
                    </div>
                )}

                {/* Email */}
                <div className="space-y-1.5">
                    <label className="text-xs font-black uppercase tracking-wider flex items-center gap-2 text-gray-700">
                        <Mail className="w-4 h-4 text-orange-500" />
                        E-mail
                    </label>
                    <input
                        type="email"
                        className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={loading}
                    />
                </div>

                {/* Senha */}
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-black uppercase tracking-wider flex items-center gap-2 text-gray-700">
                            <Lock className="w-4 h-4 text-orange-500" />
                            Senha
                        </label>
                        <a
                            href="/recuperar-senha"
                            className="text-[10px] font-bold text-orange-500 hover:underline"
                        >
                            Esqueceu?
                        </a>
                    </div>
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 pr-10"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={loading}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-orange-500 transition-colors"
                        >
                            {showPassword ? (
                                <EyeOff className="w-4 h-4" />
                            ) : (
                                <Eye className="w-4 h-4" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Botão */}
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                    {loading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            Entrar
                            <LogIn className="w-4 h-4" />
                        </>
                    )}
                </button>

                {/* Link para criar conta */}
                {onSwitchToRegister && (
                    <div className="text-center pt-2">
                        <p className="text-sm text-gray-600">
                            Ainda não tem conta?{' '}
                            <button
                                type="button"
                                onClick={onSwitchToRegister}
                                className="font-black text-orange-500 hover:underline"
                            >
                                Criar conta grátis
                            </button>
                        </p>
                    </div>
                )}
            </form>


        </div>
    )
}