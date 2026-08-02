// app/(main)/Login.tsx
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
  Eye, EyeOff, Mail, Lock, ArrowRight,
  Store, Star, TrendingUp, Shield, Users,
  ShoppingBag
} from 'lucide-react'
import { useTheme } from '@/app/theme'
import Header from '@/app/Header'
import { LoadingSpinner } from '@/components/LoadingSpinner'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export const dynamic = 'force-dynamic'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { colors, setTheme } = useTheme()

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

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('app_theme')
          .eq('id', user.id)
          .single()

        if (profile?.app_theme) {
          setTheme(profile.app_theme)
        }
      }

      router.push('/')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const beneficios = [
    { icon: Store, titulo: 'Sua vitrine online', descricao: 'Crie sua loja em minutos e mostre seus produtos para milhares de clientes.' },
    { icon: ShoppingBag, titulo: 'Vendas simplificadas', descricao: 'Gerencie pedidos, receba pagamentos e acompanhe tudo em tempo real.' },
    { icon: Star, titulo: 'Avaliações e reputação', descricao: 'Construa confiança com avaliações verificadas e aumente suas vendas.' },
    { icon: TrendingUp, titulo: 'Crescimento acelerado', descricao: 'Ferramentas inteligentes para divulgar seu negócio e atrair mais clientes.' },
    { icon: Shield, titulo: '100% gratuito', descricao: 'Sem mensalidades, sem taxas escondidas. Você só paga quando vender.' },
    { icon: Users, titulo: 'Comunidade ativa', descricao: 'Conecte-se com outros vendedores, troque experiências e cresça junto.' },
  ]

  // ===== STYLE PARA BOTÕES PILL =====
  const pillButtonStyle = {
    width: '100%',
    padding: '0.75rem 1.25rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.875rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
  }

  return (
    <div className="relative flex flex-col min-h-screen" style={{ background: colors.background }}>
      <Header title="iUser" showBack={false} />

      {success === 'account_created' && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top duration-500 max-w-sm mx-auto">
          <div className="px-5 py-3 text-xs font-bold rounded-full shadow-lg border text-center"
            style={{ background: GRADIENT, color: '#ffffff', borderColor: '#f9731633' }}>
            🎉 Conta criada com sucesso! Faça seu login para começar.
          </div>
        </div>
      )}

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8">
        <form onSubmit={handleLogin} className="w-full max-w-md">
          {error && (
            <div className="mb-6 p-3 text-xs font-bold rounded-full border"
              style={{ background: '#f9731622', borderColor: '#f9731644', color: '#f97316' }}>
              ⚠️ {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider flex items-center gap-2 ml-1"
                style={{ color: colors.textSecondary }}>
                <Mail className="w-4 h-4" style={{ color: '#f97316' }} /> E-mail
              </label>
              <input
                type="email"
                className="w-full px-4 py-3 border-2 rounded-full text-sm transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                style={{
                  background: `${colors.surface}88`,
                  borderColor: colors.border,
                  color: colors.textPrimary,
                }}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <label className="text-xs font-black uppercase tracking-wider flex items-center gap-2"
                  style={{ color: colors.textSecondary }}>
                  <Lock className="w-4 h-4" style={{ color: '#f97316' }} /> Senha
                </label>
                <a href="/recuperar-senha" className="text-[10px] font-bold transition-all hover:underline" style={{ color: '#f97316' }}>
                  Esqueceu?
                </a>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full px-4 py-3 border-2 rounded-full text-sm transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  style={{
                    background: `${colors.surface}88`,
                    borderColor: colors.border,
                    color: colors.textPrimary,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: colors.textSecondary }}>
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...pillButtonStyle,
              background: GRADIENT,
              color: '#ffffff',
              boxShadow: `0 4px 14px #f9731660`,
              opacity: loading ? 0.6 : 1,
              marginTop: '1.5rem',
            }}
            className="hover:scale-105 transition-transform active:scale-95"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <> Entrar <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /> </>
            )}
          </button>

          <div className="mt-6 text-center">
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Ainda não tem uma conta?{' '}
              <a href="/register" className="font-black transition-colors underline-offset-4 hover:underline" style={{ color: '#f97316' }}>
                Criar conta grátis
              </a>
            </p>
          </div>
        </form>

        <div className="w-full max-w-2xl mt-12 mb-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-black" style={{ color: colors.textPrimary }}>mais do iUser</h2>
            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>algumas funcionalidades...</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {beneficios.map((b, i) => (
              <div key={i} className="rounded-2xl p-4 border backdrop-blur-md transition-all hover:shadow-lg"
                style={{ background: `${colors.surface}88`, borderColor: colors.border, boxShadow: colors.shadow }}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: GRADIENT, color: '#ffffff' }}>
                    <b.icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>{b.titulo}</h3>
                    <p className="text-[11px] mt-1 leading-relaxed" style={{ color: colors.textSecondary }}>{b.descricao}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-6">
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              ✨ Junte-se a milhares de empreendedores que já estão vendendo mais com o iUser.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Login() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#ffffff' }}>
        <LoadingSpinner message="Carregando..." background="#ffffff" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}