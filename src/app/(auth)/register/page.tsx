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
    }  return (
    <div className="relative flex items-center justify-center min-h-screen bg-black px-4 py-12 overflow-hidden selection:bg-white selection:text-black">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[130px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <form onSubmit={handleRegister} className="relative z-10 w-full max-w-lg p-12 bg-neutral-900/40 backdrop-blur-3xl border border-white/5 rounded-[48px] shadow-2xl animate-in fade-in zoom-in duration-700">
        <div className="text-center space-y-4 mb-10">
          <h1 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter text-white leading-none">
            Bem-vindo ao <span className="text-blue-500">iUser.</span>
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-neutral-500">Inicie sua Jornada Digital</p>
        </div>

        {error && (
          <div className="p-5 mb-8 text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 border border-red-500/20 rounded-2xl animate-shake">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-4">Full Identity / Nome</label>
            <input
              type="text"
              className="w-full px-8 py-4 bg-black border border-white/5 rounded-[24px] text-white placeholder:text-neutral-800 focus:outline-none focus:border-white/20 focus:ring-4 focus:ring-white/5 transition-all duration-500"
              placeholder="Como devemos lhe chamar?"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-4">Unique Slug / Link do Perfil</label>
            <div className="flex items-center bg-black border border-white/5 rounded-[24px] focus-within:border-white/20 focus-within:ring-4 focus-within:ring-white/5 transition-all duration-500 overflow-hidden group">
              <span className="pl-6 pr-1 text-[10px] font-black text-neutral-600 uppercase tracking-widest bg-white/[0.02] h-full flex items-center">iuser.com.br/</span>
              <input
                type="text"
                className="w-full py-4 pl-1 pr-6 bg-transparent text-white outline-none placeholder:text-neutral-800"
                placeholder="seu-link"
                value={profileSlug}
                onChange={(e) => setProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-4">Credential / Email</label>
            <input
              type="email"
              className="w-full px-8 py-4 bg-black border border-white/5 rounded-[24px] text-white placeholder:text-neutral-800 focus:outline-none focus:border-white/20 focus:ring-4 focus:ring-white/5 transition-all duration-500"
              placeholder="Seu melhor e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-4">Password</label>
              <input
                type="password"
                className="w-full px-6 py-4 bg-black border border-white/5 rounded-[24px] text-white placeholder:text-neutral-800 focus:outline-none focus:border-white/20 focus:ring-4 focus:ring-white/5 transition-all duration-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ml-4">Confirm</label>
              <input
                type="password"
                className="w-full px-6 py-4 bg-black border border-white/5 rounded-[24px] text-white placeholder:text-neutral-800 focus:outline-none focus:border-white/20 focus:ring-4 focus:ring-white/5 transition-all duration-500"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-10 bg-white text-black py-5 rounded-[32px] font-black uppercase text-sm tracking-widest transition-all hover:bg-neutral-200 active:scale-[0.96] disabled:opacity-30 shadow-2xl hover:shadow-white/10"
        >
          {loading ? 'Processando...' : 'Finalizar Cadastro'}
        </button>

        <p className="mt-10 text-center text-[10px] font-black uppercase tracking-[0.2em] text-neutral-600">
          Já faz parte da rede?{' '}
          <a href="/login" className="text-white hover:text-blue-400 transition ml-2">Login &rarr;</a>
        </p>
      </form>
    </div>
  )
}
v>
  )
}