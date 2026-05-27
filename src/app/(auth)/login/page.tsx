// src/app/(auth)/login/page.tsx
'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Mail, Lock, ArrowRight, Sparkles, Store, Zap } from 'lucide-react'
import { BottomNav } from '@/components/BottomNav'
import AnimatedBackground from '@/components/AnimatedBackground'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

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

    const supabase = createClient()

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
    <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
      <AnimatedBackground />

      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(5deg); }
        }
      `}</style>

      {/* Success Snackbar */}
      {success === 'account_created' && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top duration-500 max-w-sm mx-auto">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-5 py-3 text-xs font-bold rounded-full shadow-lg border border-white/20 text-center">
            🎉 Conta criada com sucesso! Faça seu login para começar.
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <form onSubmit={handleLogin} className="w-full max-w-md mb-8">
          {/* Logo Avatar Circular */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-xl mx-auto">
                <img src="/logo.png" alt="iUser" className="w-12 h-12 object-contain rounded-full" />
              </div>
            </div>

            <h1 className="text-3xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-2">
              Bem-vindo ao iUser
            </h1>
            <p className="text-sm text-gray-600">
              Mostre ao mundo o que você tem de melhor
            </p>

            {/* Feature badges */}
            <div className="flex items-center justify-center gap-4 mt-4">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-600 bg-orange-100 px-3 py-1 rounded-full">
                <Store className="w-3 h-3" />
                <span>Sua loja</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-100 px-3 py-1 rounded-full">
                <Zap className="w-3 h-3" />
                <span>Venda em tempo real</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-yellow-600 bg-yellow-100 px-3 py-1 rounded-full">
                <Sparkles className="w-3 h-3" />
                <span>Grátis</span>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl">
              ⚠️ {error}
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2 ml-1">
                <Mail className="w-4 h-4 text-orange-500" />
                E-mail
              </label>
              <div className="relative group">
                <input
                  type="email"
                  className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-orange-500" />
                  Senha
                </label>
                <a
                  href="/recuperar-senha"
                  className="text-xs font-bold text-orange-500 hover:text-orange-600 transition-all"
                >
                  Esqueceu a senha?
                </a>
              </div>
              <div className="relative group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
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
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative w-full mt-8 bg-gradient-to-r from-orange-500 to-red-500 text-white py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
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
            <p className="text-sm text-gray-600">
              Ainda não tem seu perfil?{' '}
              <a
                href="/register"
                className="font-black text-orange-600 hover:text-orange-700 transition-colors underline-offset-4 hover:underline"
              >
                Criar conta grátis
              </a>
            </p>
          </div>

          <div className="mt-8 pt-6 pb-4 border-t border-orange-200/30">
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-orange-200/50">
              <p className="text-[11px] text-gray-600 text-center leading-relaxed">
                ✨ <span className="font-black text-orange-600">Mostre para todos ao redor</span> o que você tem de melhor.<br />
                Sua loja, suas vendas, seu sucesso.
              </p>
            </div>
          </div>
        </form>
      </div>

      <BottomNav />
    </div>
  )
}

export default function Login() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}