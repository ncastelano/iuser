'use client'

import { useState, useEffect, Suspense, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import {
    User,
    Link as LinkIcon,
    Mail,
    Lock,
    ArrowRight,
    CheckCircle2,
    Store,
    Zap,
    Sparkles,
    Eye,
    EyeOff,
    Loader2,
    LogIn,
} from 'lucide-react'
import { toast } from 'sonner'

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

interface LoginAndRegisterProps {
    onLoginSuccess?: () => void
}

function LoginAndRegisterContent({ onLoginSuccess }: LoginAndRegisterProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    // States para Login
    const [loginEmail, setLoginEmail] = useState('')
    const [loginPassword, setLoginPassword] = useState('')
    const [loginError, setLoginError] = useState<string | null>(null)
    const [loginLoading, setLoginLoading] = useState(false)
    const [showLoginPassword, setShowLoginPassword] = useState(false)

    // States para Register
    const [name, setName] = useState('')
    const [profileSlug, setProfileSlug] = useState('')
    const [registerEmail, setRegisterEmail] = useState('')
    const [registerPassword, setRegisterPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [registerError, setRegisterError] = useState<string | null>(null)
    const [registerLoading, setRegisterLoading] = useState(false)
    const [registered, setRegistered] = useState(false)
    const [showRegisterPassword, setShowRegisterPassword] = useState(false)
    const profileSlugRef = useRef<string>('')

    // Estado para controlar qual tela mostrar
    const [isLogin, setIsLogin] = useState(true)

    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const borderColor = colors.border

    // HANDLE LOGIN
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoginLoading(true)
        setLoginError(null)

        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: loginEmail,
                password: loginPassword,
            })
            if (authError) throw authError

            toast.success('Login realizado com sucesso!')

            // Fecha a tela de login e vai para home com refresh
            if (onLoginSuccess) {
                onLoginSuccess()
            } else {
                window.location.href = '/'
            }
        } catch (err: any) {
            setLoginError(err.message)
        } finally {
            setLoginLoading(false)
        }
    }

    // HANDLE REGISTER
    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault()
        setRegisterLoading(true)
        setRegisterError(null)

        // Validações
        if (registerPassword !== confirmPassword) {
            setRegisterError('As senhas não coincidem')
            setRegisterLoading(false)
            return
        }

        if (registerPassword.length < 6) {
            setRegisterError('A senha deve ter pelo menos 6 caracteres')
            setRegisterLoading(false)
            return
        }

        if (!profileSlug || !/^[a-z0-9-]+$/.test(profileSlug)) {
            setRegisterError('O link deve conter apenas letras minúsculas, números e hifens (-)')
            setRegisterLoading(false)
            return
        }

        try {
            // Verificar se o slug já existe
            const { data: existingProfile } = await supabase
                .from('profiles')
                .select('id')
                .eq('profileSlug', profileSlug)
                .maybeSingle()

            if (existingProfile) {
                setRegisterError('Este link já está em uso por outro usuário.')
                setRegisterLoading(false)
                return
            }

            // Buscar referral
            let referralSlug = null
            const refParam = searchParams.get('ref')
            if (refParam) {
                referralSlug = refParam
            } else {
                try {
                    const res = await fetch('/api/get-referral-cookie')
                    const data = await res.json()
                    referralSlug = data.referralSlug || null
                } catch (error) {
                    console.error('Erro ao ler cookie:', error)
                }
            }

            // Buscar upline
            let uplineId = null
            if (referralSlug) {
                const { data: upline } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('profileSlug', referralSlug)
                    .maybeSingle()

                if (upline) {
                    uplineId = upline.id
                }
            }

            // Criar usuário no Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: registerEmail,
                password: registerPassword,
                options: {
                    data: { name },
                }
            })

            if (authError) throw authError
            if (!authData.user) throw new Error('Usuário não criado')

            // Salvar slug no ref
            profileSlugRef.current = profileSlug

            // Criar perfil
            const profileData = {
                id: authData.user.id,
                name: name,
                profileSlug: profileSlug,
                upline_id: uplineId,
                email: registerEmail,
                is_active: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }

            const { error: profileError } = await supabase
                .from('profiles')
                .upsert(profileData, { onConflict: 'id' })

            if (profileError) throw new Error(`Erro ao criar perfil: ${profileError.message}`)

            // Limpar cookie
            try {
                await fetch('/api/clear-referral-cookie', { method: 'POST' })
            } catch (error) {
                console.error('Erro ao limpar cookie:', error)
            }

            // 🔥 FAZER LOGIN AUTOMÁTICO
            const { error: loginError } = await supabase.auth.signInWithPassword({
                email: registerEmail,
                password: registerPassword,
            })

            if (loginError) {
                console.error('Erro ao fazer login automático:', loginError)
                toast.error('Conta criada, mas não foi possível fazer login automático. Faça login manualmente.')
                setRegistered(true)
                return
            }

            // ✅ Login automático bem sucedido!
            setRegistered(true)
            toast.success('🎉 Conta criada e logado com sucesso!')
            window.scrollTo({ top: 0, behavior: 'smooth' })

        } catch (err: any) {
            console.error('❌ Erro no registro:', err)
            setRegisterError(err.message || 'Erro ao criar conta. Tente novamente.')
        } finally {
            setRegisterLoading(false)
        }
    }

    // Redirecionar após registro
    useEffect(() => {
        if (!registered) return

        const timer = setTimeout(() => {
            // Como já estamos logados, podemos redirecionar direto
            if (onLoginSuccess) {
                onLoginSuccess()
            } else {
                window.location.href = '/'
            }
        }, 2000)

        return () => clearTimeout(timer)
    }, [registered, onLoginSuccess])

    // Tela de sucesso do registro
    if (registered) {
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
                            Conta criada! 🎉
                        </h2>
                        <p className="text-sm" style={{ color: textSecondary }}>
                            Bem-vindo ao iUser! Seu perfil está pronto.
                        </p>

                        <button
                            onClick={() => {
                                window.location.href = '/'
                            }}
                            className="w-full mt-6 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                            style={{
                                background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                color: '#ffffff',
                                boxShadow: `0 4px 14px #f9731640`,
                            }}
                        >
                            <User className="w-4 h-4" />
                            ir para o início...
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // TELA PRINCIPAL (Login ou Register)
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
                                {isLogin ? 'Acesse sua conta' : 'Crie seu perfil'}
                            </h1>
                            <p className="text-sm" style={{ color: textSecondary }}>
                                {isLogin
                                    ? 'Entre e comece a vender'
                                    : 'Comece a vender em minutos. É grátis!'
                                }
                            </p>

                            {!isLogin && (
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
                                        <span>Grátis</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* FORMULÁRIO DE LOGIN */}
                        {isLogin ? (
                            <form onSubmit={handleLogin} className="space-y-5">
                                {loginError && (
                                    <div
                                        className="p-3 text-xs font-bold rounded-xl"
                                        style={{
                                            background: '#ef444420',
                                            border: `1px solid #ef444430`,
                                            color: '#ef4444',
                                        }}
                                    >
                                        ⚠️ {loginError}
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
                                        value={loginEmail}
                                        onChange={(e) => setLoginEmail(e.target.value)}
                                        required
                                        disabled={loginLoading}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                                            <Lock className="w-3.5 h-3.5" style={{ color: accentColor }} />
                                            SENHA
                                        </label>
                                        <a
                                            href="/recuperar-senha"
                                            className="text-[10px] font-bold hover:underline"
                                            style={{ color: accentColor }}
                                        >
                                            Esqueceu?
                                        </a>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={showLoginPassword ? 'text' : 'password'}
                                            className="w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none focus:ring-2 pr-10"
                                            style={{
                                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                                border: `2px solid ${borderColor}`,
                                                color: textPrimary,
                                                '--tw-ring-color': accentColor,
                                            } as React.CSSProperties}
                                            placeholder="••••••••"
                                            value={loginPassword}
                                            onChange={(e) => setLoginPassword(e.target.value)}
                                            required
                                            disabled={loginLoading}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowLoginPassword(!showLoginPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                                            style={{ color: textSecondary }}
                                        >
                                            {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loginLoading}
                                    className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
                                    style={{
                                        background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                        color: '#ffffff',
                                        boxShadow: `0 4px 14px #f9731640`,
                                    }}
                                >
                                    {loginLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            Entrar
                                            <LogIn className="w-4 h-4" />
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
                                            Ainda não tem conta?
                                        </span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsLogin(false)}
                                    className="w-full py-3.5 rounded-xl font-bold text-sm transition-all hover:scale-[1.02]"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                        border: `2px solid ${borderColor}`,
                                        color: textSecondary,
                                    }}
                                >
                                    Criar conta grátis
                                </button>
                            </form>
                        ) : (
                            /* FORMULÁRIO DE REGISTRO */
                            <form onSubmit={handleRegister} className="space-y-4">
                                {registerError && (
                                    <div
                                        className="p-3 text-xs font-bold rounded-xl"
                                        style={{
                                            background: '#ef444420',
                                            border: `1px solid #ef444430`,
                                            color: '#ef4444',
                                        }}
                                    >
                                        ⚠️ {registerError}
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                                        <User className="w-3.5 h-3.5" style={{ color: accentColor }} />
                                        SEU NOME
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none focus:ring-2"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                            border: `2px solid ${borderColor}`,
                                            color: textPrimary,
                                            '--tw-ring-color': accentColor,
                                        } as React.CSSProperties}
                                        placeholder="Como você quer ser chamado?"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                        disabled={registerLoading}
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                                        <LinkIcon className="w-3.5 h-3.5" style={{ color: accentColor }} />
                                        SEU LINK
                                    </label>
                                    <div
                                        className="flex items-center rounded-xl transition-all overflow-hidden focus-within:ring-2"
                                        style={{
                                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                            border: `2px solid ${borderColor}`,
                                            '--tw-ring-color': accentColor,
                                        } as React.CSSProperties}
                                    >
                                        <span className="pl-4 pr-1 text-xs font-mono py-3" style={{ color: textSecondary }}>
                                            iuser.com.br/
                                        </span>
                                        <input
                                            type="text"
                                            className="flex-1 py-3 pl-0 pr-4 outline-none text-sm font-mono"
                                            style={{
                                                background: 'transparent',
                                                color: textPrimary,
                                            }}
                                            placeholder="seu-nome"
                                            value={profileSlug}
                                            onChange={(e) => setProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                            required
                                            disabled={registerLoading}
                                        />
                                    </div>
                                    <p className="text-[10px]" style={{ color: textSecondary }}>
                                        🔗 Seu link público: <span className="font-mono font-bold" style={{ color: accentColor }}>/{profileSlug || "seu-nome"}</span>
                                    </p>
                                </div>

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
                                        value={registerEmail}
                                        onChange={(e) => setRegisterEmail(e.target.value)}
                                        required
                                        disabled={registerLoading}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                                            <Lock className="w-3.5 h-3.5" style={{ color: accentColor }} />
                                            SENHA
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showRegisterPassword ? 'text' : 'password'}
                                                className="w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none focus:ring-2 pr-10"
                                                style={{
                                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                                    border: `2px solid ${borderColor}`,
                                                    color: textPrimary,
                                                    '--tw-ring-color': accentColor,
                                                } as React.CSSProperties}
                                                placeholder="••••••••"
                                                value={registerPassword}
                                                onChange={(e) => setRegisterPassword(e.target.value)}
                                                required
                                                disabled={registerLoading}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                                                style={{ color: textSecondary }}
                                            >
                                                {showRegisterPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                                            <Lock className="w-3.5 h-3.5" style={{ color: accentColor }} />
                                            CONFIRMAR
                                        </label>
                                        <input
                                            type={showRegisterPassword ? 'text' : 'password'}
                                            className="w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none focus:ring-2"
                                            style={{
                                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                                                border: `2px solid ${borderColor}`,
                                                color: textPrimary,
                                                '--tw-ring-color': accentColor,
                                            } as React.CSSProperties}
                                            placeholder="••••••••"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                            disabled={registerLoading}
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={registerLoading}
                                    className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50"
                                    style={{
                                        background: 'linear-gradient(135deg, #f97316, #dc2626)',
                                        color: '#ffffff',
                                        boxShadow: `0 4px 14px #f9731640`,
                                    }}
                                >
                                    {registerLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            Criar meu perfil
                                            <ArrowRight className="w-4 h-4" />
                                        </>
                                    )}
                                </button>

                                <div className="text-center">
                                    <p className="text-[10px]" style={{ color: textSecondary }}>
                                        Ao criar uma conta, você concorda com nossos{' '}
                                        <a href="/termos" className="font-bold hover:underline" style={{ color: accentColor }}>
                                            Termos de Uso
                                        </a>
                                    </p>
                                </div>

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
                                            Já tem perfil?
                                        </span>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsLogin(true)}
                                    className="w-full py-3.5 rounded-xl font-bold text-sm transition-all hover:scale-[1.02]"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                                        border: `2px solid ${borderColor}`,
                                        color: textSecondary,
                                    }}
                                >
                                    Fazer login
                                </button>

                                <div
                                    className="rounded-2xl p-4 border"
                                    style={{
                                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                        borderColor: `${borderColor}30`,
                                    }}
                                >
                                    <p className="text-[10px] text-center leading-relaxed" style={{ color: textSecondary }}>
                                        ✨ <span className="font-bold" style={{ color: accentColor }}>Mostre para todos ao redor</span> o que você tem de melhor.<br />
                                        Sua loja, suas vendas, seu sucesso.
                                    </p>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function LoginAndRegister({ onLoginSuccess }: LoginAndRegisterProps) {
    return (
        <Suspense fallback={
            <div
                className="min-h-screen flex items-center justify-center"
                style={{ background: '#000' }}
            >
                <div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
            </div>
        }>
            <LoginAndRegisterContent onLoginSuccess={onLoginSuccess} />
        </Suspense>
    )
}