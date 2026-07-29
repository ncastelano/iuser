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
  Home,
} from 'lucide-react'
import { toast } from 'sonner'

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean, 16)
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
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

  // ✅ USAR REF PARA ARMAZENAR O profileSlug (não é resetado)
  const profileSlugRef = useRef<string>('')

  const accentColor = colors.accent
  const textPrimary = colors.textPrimary
  const textSecondary = colors.textSecondary
  const borderColor = colors.border

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

    if (!profileSlug || !/^[a-z0-9-]+$/.test(profileSlug)) {
      setError('O link deve conter apenas letras minúsculas, números e hifens (-)')
      setLoading(false)
      return
    }

    try {
      // 1. Verificar se o slug já existe
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

      // 2. Buscar referral (URL ou cookie)
      let referralSlug = null

      const refParam = searchParams.get('ref')
      if (refParam) {
        referralSlug = refParam
        console.log('🔗 Ref da URL:', referralSlug)
      } else {
        try {
          const res = await fetch('/api/get-referral-cookie')
          const data = await res.json()
          referralSlug = data.referralSlug || null
          console.log('🔗 Cookie lido:', referralSlug)
        } catch (error) {
          console.error('Erro ao ler cookie:', error)
        }
      }

      // 3. Buscar o upline_id
      let uplineId = null
      if (referralSlug) {
        const { data: upline } = await supabase
          .from('profiles')
          .select('id')
          .eq('profileSlug', referralSlug)
          .maybeSingle()

        if (upline) {
          uplineId = upline.id
          console.log('✅ Upline encontrado:', uplineId)
        } else {
          console.log('⚠️ Upline não encontrado para o slug:', referralSlug)
        }
      }

      // 4. Criar usuário no Auth
      console.log('📝 Criando usuário no Auth...')
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
          }
        }
      })

      if (authError) {
        console.error('❌ Erro no Auth:', authError)
        throw authError
      }

      if (!authData.user) {
        throw new Error('Usuário não criado')
      }

      console.log('✅ Usuário criado no Auth:', authData.user.id)

      // 5. ✅ SALVAR O profileSlug NO REF ANTES DE QUALQUER COISA
      profileSlugRef.current = profileSlug
      console.log('📝 ProfileSlug salvo no ref:', profileSlugRef.current)

      // 6. Criar perfil com UPSERT
      console.log('📝 Criando/atualizando perfil (UPSERT)...')

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

      console.log('📝 Dados do perfil:', profileData)

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profileData, {
          onConflict: 'id'
        })

      if (profileError) {
        console.error('❌ Erro ao criar perfil:', profileError)
        throw new Error(`Erro ao criar perfil: ${profileError.message}`)
      }

      console.log('✅ Perfil criado/atualizado com sucesso!')

      // 7. Limpar o cookie
      try {
        await fetch('/api/clear-referral-cookie', { method: 'POST' })
        console.log('✅ Cookie removido')
      } catch (error) {
        console.error('Erro ao limpar cookie:', error)
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

  // ✅ Tela de sucesso
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
              className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center shadow-xl mb-4"
              style={{
                background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                color: colors.accentText,
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
                const slug = profileSlugRef.current
                console.log('🔀 Botão: Redirecionando com slug:', slug)
                window.location.href = '/'
              }}
              className="w-full mt-6 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
              style={{
                background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                color: colors.accentText,
                boxShadow: `0 4px 14px ${accentColor}40`,
              }}
            >
              <User className="w-4 h-4" />
              Ver meu perfil
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
            {/* Logo */}
            <div className="text-center">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{
                  background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                  color: colors.accentText,
                }}
              >
                <img src="/logotransparente.png" alt="iUser" className="w-12 h-12 object-contain" />
              </div>

              <h1 className="text-2xl font-black" style={{ color: textPrimary }}>
                Crie seu perfil
              </h1>
              <p className="text-sm" style={{ color: textSecondary }}>
                Comece a vender em minutos. É grátis!
              </p>

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
            </div>

            {/* Error Message */}
            {error && (
              <div
                className="p-3 text-xs font-bold rounded-xl"
                style={{
                  background: '#ef444420',
                  border: `1px solid #ef444430`,
                  color: '#ef4444',
                }}
              >
                ⚠️ {error}
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-4">
              {/* Nome */}
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
                  disabled={loading}
                />
              </div>

              {/* Slug (link) */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                  <LinkIcon className="w-3.5 h-3.5" style={{ color: accentColor }} />
                  SEU LINK
                </label>
                <div
                  className="flex items-center rounded-xl transition-all overflow-hidden focus-within:ring-2 focus-within:ring-opacity-50"
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
                  🔗 Seu link público: <span className="font-mono font-bold" style={{ color: accentColor }}>/{profileSlug || "seu-nome"}</span>
                </p>
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                  <Mail className="w-3.5 h-3.5" style={{ color: accentColor }} />
                  E-MAIL
                </label>
                <input
                  type="email"
                  className="w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-opacity-50"
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

              {/* Senha e Confirmar senha lado a lado */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider flex items-center gap-2" style={{ color: textSecondary }}>
                    <Lock className="w-3.5 h-3.5" style={{ color: accentColor }} />
                    SENHA
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-opacity-50 pr-10"
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
                    CONFIRMAR
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full px-4 py-3 rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-opacity-50"
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
            </div>

            {/* Botão de cadastro */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: `linear-gradient(135deg, ${accentColor}, ${colors.accentLight})`,
                color: colors.accentText,
                boxShadow: `0 4px 14px ${accentColor}40`,
              }}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Criar meu perfil
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
                    background: colors.surface,
                    color: textSecondary,
                  }}
                >
                  Já tem perfil?
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
        <div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    }>
      <RegisterContent />
    </Suspense>
  )
}