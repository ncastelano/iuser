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

  // ✅ evita erro de prerender pegando params no client
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
    <div className="flex items-center justify-center min-h-screen bg-black px-4">

      {/* ✅ Snackbar */}
      {success === 'account_created' && (
        <Snackbar message="Sua conta foi criada com sucesso. Faça login para entrar." />
      )}

      <form
        onSubmit={handleLogin}
        className="w-full max-w-md p-8 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl relative overflow-hidden"
      >
        {/* Glow */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-white rounded-full blur-[100px] opacity-5 pointer-events-none"></div>

        <h1 className="mb-8 text-3xl font-extrabold text-center tracking-tight text-white">
          iUser
        </h1>

        {error && (
          <div className="p-4 mb-6 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl">
            {error}
          </div>
        )}

        <div className="mb-5">
          <label className="block mb-2 text-sm font-semibold text-neutral-300 ml-1">
            Email
          </label>
          <input
            type="email"
            className="w-full p-3.5 bg-neutral-950 text-white rounded-xl border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white outline-none transition placeholder:text-neutral-600"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <div className="mb-8">
          <label className="block mb-2 text-sm font-semibold text-neutral-300 ml-1">
            Senha
          </label>
          <input
            type="password"
            className="w-full p-3.5 bg-neutral-950 text-white rounded-xl border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white outline-none transition placeholder:text-neutral-600"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 bg-white hover:bg-neutral-200 active:bg-neutral-300 text-black py-4 rounded-xl font-bold text-lg transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_25px_rgba(255,255,255,0.25)]"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        <p className="mt-8 text-center text-sm font-medium text-neutral-400">
          Não tem conta?{' '}
          <a
            href="/register"
            className="text-white hover:underline transition ml-1"
          >
            Cadastre-se
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
