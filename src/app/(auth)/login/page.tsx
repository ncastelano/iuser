// src/app/(auth)/login/page.tsx
'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Snackbar from '@/components/Snackbar'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [success, setSuccess] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
    <div className="relative flex items-center justify-center min-h-screen bg-black px-4 overflow-hidden selection:bg-white selection:text-black">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[130px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      {/* ✅ Snackbar */}
      {success === 'account_created' && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top duration-500">
          <div className="bg-white text-black px-8 py-4 rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-2xl">
            Conta Criada com Sucesso
          </div>
        </div>
      )}

      <form
        onSubmit={handleLogin}
        className="relative z-10 w-full max-w-lg p-12 bg-neutral-900/40 backdrop-blur-3xl border border-white/5 rounded-[48px] shadow-2xl animate-in fade-in zoom-in duration-700"
      >
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-6xl md:text-7xl font-black italic uppercase tracking-tighter text-white leading-none">
            iUser<span className="text-blue-500">.</span>
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-500">Mostre o que você tem de melhor</p>
        </div>

        {error && (
          <div className="p-5 mb-8 text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 border border-red-500/20 rounded-2xl animate-shake">
            {error}
          </div>
        )}

        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-4">
              Credential / Email
            </label>
            <input
              type="email"
              className="w-full px-8 py-5 bg-black border border-white/5 rounded-[28px] text-white placeholder:text-neutral-800 focus:outline-none focus:border-white/20 focus:ring-4 focus:ring-white/5 transition-all duration-500"
              placeholder="Digite seu e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-4">
              Access Code / Password
            </label>
            <input
              type="password"
              className="w-full px-8 py-5 bg-black border border-white/5 rounded-[28px] text-white placeholder:text-neutral-800 focus:outline-none focus:border-white/20 focus:ring-4 focus:ring-white/5 transition-all duration-500"
              placeholder="Sua senha secreta"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-12 bg-white text-black py-6 rounded-[32px] font-black uppercase text-sm tracking-widest transition-all hover:bg-neutral-200 active:scale-[0.96] disabled:opacity-30 shadow-2xl hover:shadow-white/10"
        >
          {loading ? 'Validando...' : 'Entrar no Sistema'}
        </button>

        <p className="mt-12 text-center text-[10px] font-black uppercase tracking-[0.2em] text-neutral-600">
          Novo no ecossistema?{' '}
          <a
            href="/register"
            className="text-white hover:text-blue-400 transition ml-2"
          >
            Cadastrar Perfil &rarr;
          </a>
        </p>
      </form>
    </div>
  )
}

export default function Login() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-white">Carregando...</div>}>
      <LoginContent />
    </Suspense>
  )
}
