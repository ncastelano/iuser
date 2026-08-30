// app/(auth)/register/page.tsx

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
  ShoppingBag,
  Briefcase,
  BookOpen,
  ShoppingCart,
  Share2,
  Compass,
  TrendingUp,
  Gauge,
  Percent,
  Home,
} from 'lucide-react'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/components/LoadingSpinner'

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean, 16)
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

// Componente de badge animado com efeito rápido - CONTAINER TRANSPARENTE
function AnimatedBadge({
  words,
  icons,
  iconColor,
  currentIndex,
  shouldAnimate,
}: {
  words: string[],
  icons: React.ElementType[],
  iconColor: string,
  currentIndex: number,
  shouldAnimate: boolean
}) {
  const [displayIndex, setDisplayIndex] = useState(currentIndex)
  const [isAnimating, setIsAnimating] = useState(false)

  const Icon = icons[displayIndex]
  const word = words[displayIndex]

  useEffect(() => {
    if (shouldAnimate && currentIndex !== displayIndex) {
      setIsAnimating(true)

      setTimeout(() => {
        setDisplayIndex(currentIndex)
        setIsAnimating(false)
      }, 150)
    }
  }, [shouldAnimate, currentIndex, displayIndex])

  return (
    <div
      className="flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full h-[30px] flex-shrink-0 overflow-hidden"
      style={{
        background: 'transparent',
        color: iconColor,
        minWidth: '120px',
        paddingLeft: '10px',
        paddingRight: '10px',
        position: 'relative',
      }}
    >
      <div className="relative w-3.5 h-3.5 flex-shrink-0 overflow-hidden">
        {/* Ícone atual */}
        <div
          className="absolute inset-0 flex items-center justify-center transition-all duration-150 ease-in-out"
          style={{
            transform: isAnimating ? 'translateY(-100%)' : 'translateY(0)',
            opacity: isAnimating ? 0 : 1,
          }}
        >
          <Icon className="w-3.5 h-3.5 flex-shrink-0" />
        </div>
      </div>

      <div className="relative h-[16px] overflow-hidden flex-1">
        {/* Palavra atual */}
        <span
          className="absolute left-0 whitespace-nowrap transition-all duration-150 ease-in-out text-[11px]"
          style={{
            transform: isAnimating ? 'translateY(-100%)' : 'translateY(0)',
            opacity: isAnimating ? 0 : 1,
          }}
        >
          {word}
        </span>
      </div>
    </div>
  )
}

function RegisterContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { colors } = useTheme()
  const surfaceRgb = hexToRgb(colors.surface)

  const [name, setName] = useState('')
  const [profileSlug, setProfileSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Índices para cada badge
  const [storeIndex, setStoreIndex] = useState(0)
  const [actionIndex, setActionIndex] = useState(0)
  const [taxIndex, setTaxIndex] = useState(0)

  // Controle de animação
  const [animateBadge, setAnimateBadge] = useState<'store' | 'action' | 'tax' | null>(null)

  const profileSlugRef = useRef<string>('')

  const accentColor = colors.accent
  const textPrimary = colors.textPrimary
  const textSecondary = colors.textSecondary
  const borderColor = colors.border

  // Words e ícones originais para os badges
  const storeWords = ['sua loja', 'seu produto', 'seu serviço', 'sua publicação']
  const storeIcons = [Store, ShoppingBag, Briefcase, BookOpen]

  const actionWords = ['venda', 'compre', 'compartilhe']
  const actionIcons = [TrendingUp, ShoppingCart, Share2]

  const taxWords = ['Taxa 0%!', 'sem taxa!']
  const taxIcons = [Sparkles, Percent]

  // Timer para avançar uma palavra por vez
  useEffect(() => {
    let step = 0

    const interval = setInterval(() => {
      if (step === 0) {
        setStoreIndex((prev) => (prev + 1) % storeWords.length)
        setAnimateBadge('store')
      } else if (step === 1) {
        setActionIndex((prev) => (prev + 1) % actionWords.length)
        setAnimateBadge('action')
      } else {
        setTaxIndex((prev) => (prev + 1) % taxWords.length)
        setAnimateBadge('tax')
      }
      step = (step + 1) % 3

      setTimeout(() => {
        setAnimateBadge(null)
      }, 200)
    }, 1500)

    return () => clearInterval(interval)
  }, [storeWords.length, actionWords.length, taxWords.length])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

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

    if (!profileSlug || !/^[a-z0-9-]+$/.test(profileSlug)) {
      setError('O link deve conter apenas letras minúsculas, números e hifens (-)')
      setLoading(false)
      return
    }

    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('profileSlug', profileSlug)
        .maybeSingle()

      if (existingProfile) {
        setError('Este link já está em uso por outro usuário.')
        setLoading(false)
        return
      }

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

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
          }
        }
      })

      if (authError) throw authError
      if (!authData.user) throw new Error('Usuário não criado')

      profileSlugRef.current = profileSlug

      const profileData = {
        id: authData.user.id,
        name: name,
        profileSlug: profileSlug,
        upline_id: uplineId,
        email: email,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profileData, {
          onConflict: 'id'
        })

      if (profileError) throw new Error(`Erro ao criar perfil: ${profileError.message}`)

      try {
        await fetch('/api/clear-referral-cookie', { method: 'POST' })
      } catch (error) {
        console.error('Erro ao limpar cookie:', error)
      }

      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (loginError) {
        console.error('Erro ao fazer login automático:', loginError)
        toast.error('Conta criada, mas não foi possível fazer login automático. Faça login manualmente.')
        setRegistered(true)
        return
      }

      setRegistered(true)
      toast.success('🎉 Conta criada com sucesso!')
      window.scrollTo({ top: 0, behavior: 'smooth' })

    } catch (err: any) {
      console.error('❌ Erro no registro:', err)
      setError(err.message || 'Erro ao criar conta. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!registered) return

    const timer = setTimeout(() => {
      window.location.href = '/'
    }, 2000)

    return () => clearTimeout(timer)
  }, [registered])

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
              WebkitBackdropFilter: 'blur(12px)',
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
              Ir para o início
            </button>

            <button
              onClick={() => router.push('/login')}
              className="w-full mt-3 py-3.5 rounded-xl font-bold text-sm transition-all hover:scale-[1.02]"
              style={{
                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                border: `2px solid ${borderColor}`,
                color: textSecondary,
              }}
            >
              Fazer login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative flex flex-col min-h-screen pb-32"
      style={{ background: colors.background }}
    >
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <form onSubmit={handleRegister} className="w-full max-w-md">
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
            {/* Logo e Título */}
            <div className="text-center">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{
                  background: 'linear-gradient(135deg, #f97316, #dc2626)',
                  color: '#ffffff',
                  boxShadow: `0 4px 14px #f9731640`,
                }}
              >
                <img src="/logotransparente.png" alt="iUser" className="w-12 h-12 object-contain" />
              </div>

              <h1 className="text-2xl font-black" style={{ color: textPrimary }}>
                Crie sua conta
              </h1>
              <p className="text-sm" style={{ color: textSecondary }}>
                Mostre o que você tem de melhor!
              </p>

              {/* Badges animados com containers transparentes */}
              <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                <AnimatedBadge
                  words={storeWords}
                  icons={storeIcons}
                  iconColor={accentColor}
                  currentIndex={storeIndex}
                  shouldAnimate={animateBadge === 'store'}
                />
                <AnimatedBadge
                  words={actionWords}
                  icons={actionIcons}
                  iconColor={accentColor}
                  currentIndex={actionIndex}
                  shouldAnimate={animateBadge === 'action'}
                />
                <AnimatedBadge
                  words={taxWords}
                  icons={taxIcons}
                  iconColor={accentColor}
                  currentIndex={taxIndex}
                  shouldAnimate={animateBadge === 'tax'}
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                className="p-3 text-xs font-bold rounded-xl flex items-start gap-2"
                style={{
                  background: '#ef444420',
                  border: `1px solid #ef444430`,
                  color: '#ef4444',
                }}
              >
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                  <User className="w-3.5 h-3.5" style={{ color: accentColor }} />
                  Nome
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
                  disabled={loading}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                  <LinkIcon className="w-3.5 h-3.5" style={{ color: accentColor }} />
                  Seu link
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
                    disabled={loading}
                  />
                </div>
                <p className="text-[10px]" style={{ color: textSecondary }}>
                  Seu link público: <span className="font-mono font-bold" style={{ color: accentColor }}>/{profileSlug || "seu-nome"}</span>
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                  <Mail className="w-3.5 h-3.5" style={{ color: accentColor }} />
                  E-mail
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                    <Lock className="w-3.5 h-3.5" style={{ color: accentColor }} />
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none focus:ring-2 pr-10"
                      style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                        border: `2px solid ${borderColor}`,
                        color: textPrimary,
                        '--tw-ring-color': accentColor,
                      } as React.CSSProperties}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: textSecondary }}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                    <Lock className="w-3.5 h-3.5" style={{ color: accentColor }} />
                    Confirmar
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
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
                    disabled={loading}
                  />
                </div>
              </div>
            </div>

            {/* Botão de cadastro */}
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
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Criar minha conta
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Termos */}
            <div className="text-center">
              <p className="text-[10px]" style={{ color: textSecondary }}>
                Ao criar uma conta, você concorda com nossos{' '}
                <a href="/termos" className="font-bold hover:underline" style={{ color: accentColor }}>
                  Termos de Uso
                </a>
              </p>
            </div>

            {/* Divisor */}
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
                  Já tem uma conta?
                </span>
              </div>
            </div>

            {/* Botão de login */}
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="w-full py-3.5 rounded-xl font-bold text-sm transition-all hover:scale-[1.02]"
              style={{
                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                border: `2px solid ${borderColor}`,
                color: textSecondary,
              }}
            >
              Fazer login
            </button>

            {/* Botão Visitar iUser */}
            <button
              type="button"
              onClick={() => router.push('/')}
              className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
              style={{
                background: 'linear-gradient(135deg, #f97316, #dc2626)',
                color: '#ffffff',
                boxShadow: `0 4px 14px #f9731640`,
              }}
            >
              <img src="/logotransparente.png" alt="iUser" className="w-5 h-5 object-contain" />
              Visitar iUser
            </button>

            {/* Mensagem motivacional */}
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
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Register() {
  return (
    <Suspense fallback={
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: '#000' }}
      >
        <LoadingSpinner message="Carregando..." background="#000" />
      </div>
    }>
      <RegisterContent />
    </Suspense>
  )
}