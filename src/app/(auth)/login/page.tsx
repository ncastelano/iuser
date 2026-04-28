// src/app/(auth)/login/page.tsx
'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react'
import { BottomNav } from '@/components/BottomNav'

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
    <div className="relative flex items-center justify-center min-h-screen bg-background px-4 py-8 overflow-hidden selection:bg-green-500 selection:text-white">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-green-500/10 blur-[130px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-secondary/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--foreground)/0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* Snackbar */}
      {success === 'account_created' && (
        <div className="fixed top-4 left-4 right-4 z-[100] animate-in slide-in-from-top duration-500">
          <div className="bg-foreground text-background px-4 py-3 font-black uppercase text-[9px] tracking-wider text-center border border-border">
            Conta Criada com Sucesso
          </div>
        </div>
      )}

      <form onSubmit={handleLogin} className="relative z-10 w-full max-w-sm">
        {/* Logo e Título */}
        <div className="text-center space-y-3 mb-8 flex flex-col items-center">
          <div className="p-2.5 flex-shrink-0">
            <img
              src="/logo.png"
              alt="iUser Logo"
              className="h-12 object-contain"
            />
          </div>
          <p className="text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground italic">
            Mostre o que você tem de melhor
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-3 text-[8px] font-black uppercase tracking-wider text-red-500 bg-red-500/10 border border-red-500/20">
            {error}
          </div>
        )}

        {/* Form Fields */}
        <div className="space-y-4">
          {/* Email Field */}
          <div className="space-y-1.5">
            <label className="text-[8px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2 ml-2">
              <Mail className="w-3 h-3" /> E-mail
            </label>
            <input
              type="email"
              className="w-full px-4 py-3 bg-muted/30 border border-border text-foreground text-base placeholder:text-muted-foreground/30 focus:outline-none focus:border-green-500/50 transition-all duration-500"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-2">
              <label className="text-[8px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Lock className="w-3 h-3" /> Senha
              </label>
              <a
                href="/recuperar-senha"
                className="text-[7px] font-black uppercase tracking-wider text-green-500 hover:underline hover:text-foreground transition-all"
              >
                Esqueceu?
              </a>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full px-4 py-3 bg-muted/30 border border-border text-foreground text-base placeholder:text-muted-foreground/30 focus:outline-none focus:border-green-500/50 transition-all duration-500 pr-10"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-all"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={loading}
          className="group w-full mt-8 bg-foreground text-background py-3.5 font-black uppercase text-[10px] tracking-wider transition-all hover:bg-green-500 hover:text-white active:scale-98 disabled:opacity-30 shadow-lg flex items-center justify-center gap-2 border border-transparent hover:border-green-500"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
          ) : (
            <>
              Entrar <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </>
          )}
        </button>

        {/* Register Link */}
        <p className="mt-6 text-center text-[8px] font-black uppercase tracking-[0.2em] text-muted-foreground">
          Novo por aqui?{' '}
          <a
            href="/register"
            className="text-foreground hover:text-green-500 transition ml-1 border-b border-muted-foreground/20"
          >
            Cadastrar Perfil
          </a>
        </p>
      </form>
      <BottomNav />
    </div>
  )
}

export default function Login() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-green-500/20 border-t-green-500 rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}