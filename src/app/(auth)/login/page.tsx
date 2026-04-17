// src/app/(auth)/login/page.tsx
'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react'

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
    <div className="relative flex items-center justify-center min-h-screen bg-background px-4 overflow-hidden selection:bg-primary selection:text-white transition-colors duration-500">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-primary/10 blur-[130px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-secondary/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--foreground)/0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* ✅ Snackbar */}
      {success === 'account_created' && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top duration-500">
          <div className="bg-foreground text-background px-8 py-4 rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-2xl">
            Conta Criada com Sucesso
          </div>
        </div>
      )}

      <form
        onSubmit={handleLogin}
        className="relative z-10 w-full max-w-lg p-12 bg-card/40 backdrop-blur-3xl border border-border dark:border-white/5 rounded-[48px] shadow-2xl animate-in fade-in zoom-in duration-700"
      >
        <div className="text-center space-y-4 mb-12 flex flex-col items-center">
          <div className="flex justify-center mb-2">
            <img src="/iuser_preta.png" alt="iUser Logo" className="h-16 md:h-20 block dark:hidden object-contain" />
            <img src="/iuser_branca.png" alt="iUser Logo" className="h-16 md:h-20 hidden dark:block object-contain" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground italic mt-4">Mostre o que você tem de melhor</p>
        </div>

        {error && (
          <div className="p-5 mb-8 text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 border border-red-500/20 rounded-2xl animate-shake">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-4 flex items-center gap-2">
              <Mail className="w-3 h-3" /> E-mail de Acesso
            </label>
            <input
              type="email"
              className="w-full px-8 py-5 bg-muted/30 border border-border dark:border-white/5 rounded-[28px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 focus:ring-4 focus:ring-primary/5 transition-all duration-500"
              placeholder="e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Lock className="w-3 h-3" /> Senha de Acesso
              </label>
              <a
                href="/recuperar-senha"
                className="text-[9px] font-black uppercase tracking-widest text-primary hover:underline hover:text-foreground transition-all"
              >
                Esqueceu a senha?
              </a>
            </div>
            <div className="relative group">
              <input
                type={showPassword ? 'text' : 'password'}
                className="w-full px-8 py-5 bg-muted/30 border border-border dark:border-white/5 rounded-[28px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 focus:ring-4 focus:ring-primary/5 transition-all duration-500 pr-16"
                placeholder="senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-6 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-all"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="group w-full mt-12 bg-foreground text-background py-6 rounded-[32px] font-black uppercase text-sm tracking-widest transition-all hover:bg-neutral-200 dark:hover:bg-white active:scale-[0.96] disabled:opacity-30 shadow-2xl flex items-center justify-center gap-3"
        >
          {loading ? 'Validando...' : (
            <>
              Entrar no ecossistema <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>

        <p className="mt-12 text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
          Novo no ecossistema?{' '}
          <a
            href="/register"
            className="text-foreground hover:text-primary transition ml-2 border-b border-muted-foreground/20"
          >
            Cadastrar Perfil
          </a>
        </p>
      </form>
    </div>
  )
}

export default function Login() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-foreground uppercase font-black text-xs tracking-widest">Carregando...</div>}>
      <LoginContent />
    </Suspense>
  )
}
