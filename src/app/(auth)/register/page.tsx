'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function Register() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [profileSlug, setProfileSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password !== confirmPassword) {
      setError('As senhas não coincidem')
      setLoading(false)
      return
    }

    if (!profileSlug || !/^[a-z0-9-]+$/.test(profileSlug)) {
      setError('O link do perfil deve conter apenas letras minúsculas, números e hifens (-)')
      setLoading(false)
      return
    }

    const supabase = createClient()

    try {
      // 0. Verificar se profileSlug já existe
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('profileSlug', profileSlug)
        .single()
      
      if (existingProfile) {
        setError('Este link já está em uso por outro usuário.')
        setLoading(false)
        return
      }

      // 1. Criar usuário no Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
          }
        }
      })

      if (authError) throw authError

      if (authData.user) {
        // 2. Buscar o cookie de referral (quem convidou)
        const getReferralSlug = async () => {
          try {
            const res = await fetch('/api/get-referral-cookie')
            const data = await res.json()
            return data.referralSlug || null
          } catch {
            return null
          }
        }

        const referralSlug = await getReferralSlug()
        let uplineId = null

        // 3. Se veio de convite, buscar o ID do upline
        if (referralSlug) {
          const { data: upline } = await supabase
            .from('profiles')
            .select('id')
            .eq('profileSlug', referralSlug)
            .single()

          uplineId = upline?.id || null
        }

        // 4. Criar/Atualizar perfil com upline_id (se houver) e profileSlug
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: authData.user.id,
            name: name,
            upline_id: uplineId,
            profileSlug: profileSlug
          })

        if (profileError) {
          console.error('Erro ao criar perfil:', profileError)
          // Mesmo com erro no perfil, o usuário foi criado no Auth
        }

        // 5. Limpar cookie de referral
        await fetch('/api/clear-referral-cookie', { method: 'POST' })

        // 6. Redirecionar para login
        router.push('/login?success=account_created')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-black px-4 py-12">
      <form onSubmit={handleRegister} className="w-full max-w-md p-8 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-white rounded-full blur-[100px] opacity-5 pointer-events-none"></div>

        <h1 className="mb-8 text-2xl text-center text-white font-medium tracking-tight">
          Criar conta no{' '}
          <span className="font-extrabold text-white tracking-wide block text-3xl mt-1">iUser</span>
        </h1>

        {error && <div className="p-4 mb-6 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl">{error}</div>}

        <div className="mb-5">
          <label className="block mb-2 text-sm font-semibold text-neutral-300 ml-1">Nome completo</label>
          <input
            type="text"
            className="w-full p-3.5 bg-neutral-950 text-white rounded-xl border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white outline-none transition placeholder:text-neutral-600"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <div className="mb-5">
          <label className="block mb-2 text-sm font-semibold text-neutral-300 ml-1">Link do seu Perfil</label>
          <div className="flex items-center bg-neutral-950 rounded-xl border border-neutral-800 focus-within:border-white focus-within:ring-1 focus-within:ring-white transition overflow-hidden">
            <span className="pl-3.5 pr-1 text-neutral-500 whitespace-nowrap">iuser.com.br/</span>
            <input
              type="text"
              className="w-full p-3.5 pl-1 bg-transparent text-white outline-none placeholder:text-neutral-600"
              placeholder="seunome"
              value={profileSlug}
              onChange={(e) => setProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              required
              disabled={loading}
            />
          </div>
        </div>

        <div className="mb-5">
          <label className="block mb-2 text-sm font-semibold text-neutral-300 ml-1">Email</label>
          <input
            type="email"
            className="w-full p-3.5 bg-neutral-950 text-white rounded-xl border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white outline-none transition placeholder:text-neutral-600"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <div className="mb-5">
          <label className="block mb-2 text-sm font-semibold text-neutral-300 ml-1">Senha</label>
          <input
            type="password"
            className="w-full p-3.5 bg-neutral-950 text-white rounded-xl border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white outline-none transition placeholder:text-neutral-600"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <div className="mb-8">
          <label className="block mb-2 text-sm font-semibold text-neutral-300 ml-1">Confirmar Senha</label>
          <input
            type="password"
            className="w-full p-3.5 bg-neutral-950 text-white rounded-xl border border-neutral-800 focus:border-white focus:ring-1 focus:ring-white outline-none transition placeholder:text-neutral-600"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 bg-white hover:bg-neutral-200 active:bg-neutral-300 text-black py-4 rounded-xl font-bold text-lg transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 shadow-[0_0_20px_rgba(255,255,255,0.15)] hover:shadow-[0_0_25px_rgba(255,255,255,0.25)]"
        >
          {loading ? 'Cadastrando...' : 'Criar minha conta'}
        </button>

        <p className="mt-8 text-center text-sm font-medium text-neutral-400">
          Já tem conta? <a href="/login" className="text-white hover:underline transition ml-1">Entre agora</a>
        </p>
      </form>
    </div>
  )
}