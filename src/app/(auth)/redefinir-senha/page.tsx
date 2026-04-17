'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Lock, ArrowRight, CheckCircle2 } from 'lucide-react'

function RedefinirSenhaContent() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('As senhas não coincidem')
      setLoading(false)
      return
    }

    const supabase = createClient()

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      })

      if (updateError) throw updateError
      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-background px-4 overflow-hidden selection:bg-primary selection:text-white transition-colors duration-500 font-sans">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-primary/10 blur-[130px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-secondary/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--foreground)/0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg p-12 bg-card/40 backdrop-blur-3xl border border-border dark:border-white/5 rounded-[48px] shadow-2xl animate-in fade-in zoom-in duration-700">
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-foreground leading-none">
            Nova <span className="font-iuser">Conexão</span>
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground italic">Defina sua nova Senha</p>
        </div>

        {success ? (
          <div className="space-y-8 py-4">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Sua senha foi redefinida!</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Agora você já pode acessar sua conta utilizando as novas credenciais.
              </p>
            </div>
            <button
              onClick={() => router.push('/login')}
              className="w-full bg-foreground text-background py-6 rounded-[32px] font-black uppercase text-sm tracking-widest transition-all hover:bg-neutral-200 dark:hover:bg-white"
            >
              Ir para o Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-8">
            {error && (
              <div className="p-5 text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 border border-red-500/20 rounded-2xl animate-shake">
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-4 flex items-center gap-2">
                  <Lock className="w-3 h-3" /> Nova Senha
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full px-8 py-5 bg-muted/30 border border-border dark:border-white/5 rounded-[28px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 focus:ring-4 focus:ring-primary/5 transition-all duration-500 pr-16"
                    placeholder="••••••••"
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

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-4 flex items-center gap-2">
                  <Lock className="w-3 h-3" /> Confirmar Nova Senha
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full px-8 py-5 bg-muted/30 border border-border dark:border-white/5 rounded-[28px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 focus:ring-4 focus:ring-primary/5 transition-all duration-500"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="group w-full bg-foreground text-background py-6 rounded-[32px] font-black uppercase text-sm tracking-widest transition-all hover:bg-neutral-200 dark:hover:bg-white active:scale-[0.96] disabled:opacity-30 shadow-2xl flex items-center justify-center gap-3"
            >
              {loading ? 'Redefinindo...' : (
                <>
                  Confirmar Nova Senha <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function RedefinirSenha() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex flex-col items-center justify-center text-foreground font-black uppercase text-xs tracking-[0.3em]">Carregando Painel...</div>}>
      <RedefinirSenhaContent />
    </Suspense>
  )
}
