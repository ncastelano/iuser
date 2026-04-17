'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Mail, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'

export default function RecoverPassword() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      })

      if (resetError) throw resetError
      setSuccess(true)
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
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-secondary/10 dark:bg-purple-600/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--foreground)/0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <div className="relative z-10 w-full max-w-lg p-12 bg-card/40 backdrop-blur-3xl border border-border dark:border-white/5 rounded-[48px] shadow-2xl animate-in fade-in zoom-in duration-700">
        <button
          onClick={() => router.push('/login')}
          className="group mb-8 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Voltar para o Login
        </button>

        <div className="text-center space-y-4 mb-12">
          <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-foreground leading-none">
            Recuperar <span className="font-iuser">Acesso</span>
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground italic">Restaurando sua Conexão</p>
        </div>

        {success ? (
          <div className="space-y-8 py-4">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-foreground">E-mail Enviado!</h2>
              <p className="text-sm text-muted-foreground">
                Enviamos as instruções de recuperação para <span className="text-foreground font-bold">{email}</span>.
                Verifique sua caixa de entrada e spam.
              </p>
            </div>
            <button
              onClick={() => router.push('/login')}
              className="w-full bg-foreground text-background py-6 rounded-[32px] font-black uppercase text-sm tracking-widest transition-all hover:bg-neutral-200 dark:hover:bg-white"
            >
              Voltar ao Início
            </button>
          </div>
        ) : (
          <form onSubmit={handleRecover} className="space-y-8">
            {error && (
              <div className="p-5 text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 border border-red-500/20 rounded-2xl">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-4 flex items-center gap-2">
                  <Mail className="w-3 h-3" /> Seu E-mail Cadastrado
                </label>
                <input
                  type="email"
                  className="w-full px-8 py-5 bg-muted/30 border border-border dark:border-white/5 rounded-[28px] text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 focus:ring-4 focus:ring-primary/5 transition-all duration-500"
                  placeholder="email@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
              {loading ? 'Enviando...' : (
                <>
                  Solicitar Link <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
