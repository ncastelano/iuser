// src/app/(auth)/login/page.tsx
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Eye, EyeOff, Mail, Lock, ArrowRight, Sparkles, Store, Zap } from 'lucide-react'
import AnimatedBackground from '@/components/AnimatedBackground'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'

export const dynamic = 'force-dynamic'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { colors } = useTheme()

  const [success, setSuccess] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    const s = searchParams.get('success')
    setSuccess(s)
  }, [searchParams])

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
      router.push('/')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative flex flex-col min-h-screen"
      style={{ background: colors.background }}
    >
      <AnimatedBackground />

      <Header
        title="iUser"
        showBack={false}
      />

      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(5deg); }
        }
      `}</style>

      {success === 'account_created' && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top duration-500 max-w-sm mx-auto">
          <div
            className="px-5 py-3 text-xs font-bold rounded-full shadow-lg border text-center"
            style={{
              background: colors.accent,
              color: colors.accentText,
              borderColor: `${colors.accent}33`,
            }}
          >
            🎉 Conta criada com sucesso! Faça seu login para começar.
          </div>
        </div>
      )}

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <form onSubmit={handleLogin} className="w-full max-w-md mb-8">
          {/* Logo Avatar Circular */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center shadow-xl mx-auto"
                style={{
                  background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
                }}
              >
                <img src="/logo.png" alt="iUser" className="w-12 h-12 object-contain rounded-full" />
              </div>
            </div>

            <h1 className="text-3xl font-black mb-2" style={{ color: colors.textPrimary }}>
              Bem-vindo ao iUser
            </h1>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Mostre ao mundo o que você tem de melhor
            </p>

            <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
              {/* Badges iguais ao anterior */}
              <div className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded-full"
                style={{ background: colors.accentLight, color: colors.accent }}>
                <Store className="w-3 h-3" /><span>Sua loja</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded-full"
                style={{ background: colors.accentLight, color: colors.accent }}>
                <Zap className="w-3 h-3" /><span>Venda em tempo real</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded-full"
                style={{ background: colors.accentLight, color: colors.accent }}>
                <Sparkles className="w-3 h-3" /><span>Grátis</span>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-3 text-xs font-bold rounded-xl border"
              style={{ background: `${colors.accent}22`, borderColor: `${colors.accent}44`, color: colors.accent }}>
              ⚠️ {error}
            </div>
          )}

          <div className="space-y-5">
            {/* Campo e-mail */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider flex items-center gap-2 ml-1"
                style={{ color: colors.textSecondary }}>
                <Mail className="w-4 h-4" style={{ color: colors.accent }} /> E-mail
              </label>
              <input
                type="email"
                className="w-full px-4 py-3 border-2 rounded-xl text-sm transition-all focus:outline-none focus:ring-2"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                style={{
                  background: `${colors.surface}88`,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                  outlineColor: colors.accent,
                }}
              />
            </div>
            {/* Campo senha */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <label className="text-xs font-black uppercase tracking-wider flex items-center gap-2"
                  style={{ color: colors.textSecondary }}>
                  <Lock className="w-4 h-4" style={{ color: colors.accent }} /> Senha
                </label>
                <a href="/recuperar-senha" className="text-xs font-bold transition-all hover:underline"
                  style={{ color: colors.accent }}>
                  Esqueceu a senha?
                </a>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full px-4 py-3 border-2 rounded-xl text-sm transition-all focus:outline-none focus:ring-2"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  style={{
                    background: `${colors.surface}88`,
                    borderColor: colors.border,
                    color: colors.textPrimary,
                    outlineColor: colors.accent,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: colors.textSecondary }}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative w-full mt-8 py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentLight})`,
              color: colors.accentText,
            }}
          >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Entrar na minha conta
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </span>
          </button>

          <div className="mt-8 text-center">
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Ainda não tem seu perfil?{' '}
              <a href="/register" className="font-black transition-colors underline-offset-4 hover:underline"
                style={{ color: colors.accent }}>
                Criar conta grátis
              </a>
            </p>
          </div>

          <div className="mt-8 pt-6 pb-4 border-t" style={{ borderColor: colors.border }}>
            <div className="rounded-2xl p-4 border shadow-lg"
              style={{ background: `${colors.surface}44`, borderColor: colors.border }}>
              <p className="text-[11px] text-center leading-relaxed" style={{ color: colors.textSecondary }}>
                ✨ <span className="font-black" style={{ color: colors.accent }}>Mostre para todos ao redor</span> o que você tem de melhor.<br />
                Sua loja, suas vendas, seu sucesso.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Login() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#ffffff' }}>
        <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}