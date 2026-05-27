// src/app/(auth)/register/page.tsx
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  User,
  Link as LinkIcon,
  Mail,
  Lock,
  ArrowRight,
  CheckCircle2,
  Store,
  Zap,
  Sparkles,
  Eye,
  EyeOff
} from 'lucide-react'
import { BottomNav } from '@/components/BottomNav'
import AnimatedBackground from '@/components/AnimatedBackground'

function RegisterContent() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [profileSlug, setProfileSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
      setError('O link deve conter apenas letras minúsculas, números e hifens (-)')
      setLoading(false)
      return
    }

    const supabase = createClient()

    try {
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

        if (referralSlug) {
          const { data: upline } = await supabase
            .from('profiles')
            .select('id')
            .eq('profileSlug', referralSlug)
            .single()

          uplineId = upline?.id || null
        }

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
        }

        await fetch('/api/clear-referral-cookie', { method: 'POST' })

        setRegistered(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Tela de sucesso após cadastro
  if (registered) {
    return (
      <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
        <AnimatedBackground />
        <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-md text-center">
            <div className="mb-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-xl">
                <CheckCircle2 className="w-10 h-10 text-white" />
              </div>
            </div>
            <h2 className="text-2xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-2">
              Perfil criado! 🎉
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Enviamos um link de <span className="font-bold text-gray-900">ativação</span> para o seu e-mail.
            </p>
            <p className="text-sm text-gray-600 mb-6">
              Após confirmar, seu perfil <span className="font-mono text-xs bg-white/60 px-1 py-0.5 rounded border border-orange-200">/{profileSlug}</span> estará no ar
              e você poderá <span className="font-bold text-gray-900">criar sua primeira loja</span>!
            </p>
            <button
              onClick={() => router.push('/login')}
              className="group w-full bg-gradient-to-r from-orange-500 to-red-500 text-white py-3.5 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:shadow-lg hover:scale-105 active:scale-95"
            >
              Ir para o Login
              <ArrowRight className="w-4 h-4 inline-block ml-2 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
      <AnimatedBackground />

      {/* Main content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <form onSubmit={handleRegister} className="w-full max-w-md mb-8">
          {/* Logo Avatar Circular */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-xl mx-auto">
                <img src="/logo.png" alt="iUser" className="w-12 h-12 object-contain rounded-full" />
              </div>
            </div>

            <h1 className="text-3xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-2">
              Crie seu perfil
            </h1>
            <p className="text-sm text-gray-600">
              Comece a vender em minutos. É grátis!
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
            {/* Nome */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2 ml-1">
                <User className="w-4 h-4 text-orange-500" />
                SEU NOME
              </label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                placeholder="Como você quer ser chamado?"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {/* Slug (link) */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2 ml-1">
                <LinkIcon className="w-4 h-4 text-orange-500" />
                SEU LINK
              </label>
              <div className="flex items-center bg-white border-2 border-orange-200 rounded-xl focus-within:border-orange-500 transition-all overflow-hidden">
                <span className="pl-4 pr-1 text-xs font-mono text-gray-400 bg-white py-3">
                  iuser.com.br/
                </span>
                <input
                  type="text"
                  className="flex-1 py-3 pl-0 pr-4 bg-white text-gray-900 outline-none text-sm font-mono"
                  placeholder="seu-nome"
                  value={profileSlug}
                  onChange={(e) => setProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  required
                  disabled={loading}
                />
              </div>
              <p className="text-[11px] text-gray-500 ml-1">
                🔗 Seu link público: <span className="font-mono font-bold">/{profileSlug || "seu-nome"}</span>
              </p>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2 ml-1">
                <Mail className="w-4 h-4 text-orange-500" />
                E-MAIL
              </label>
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

            {/* Senha e Confirmar senha lado a lado */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2 ml-1">
                  <Lock className="w-4 h-4 text-orange-500" />
                  SENHA
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 pr-10"
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
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2 ml-1">
                  <Lock className="w-4 h-4 text-orange-500" />
                  CONFIRMAR
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Botão de cadastro */}
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
                  Criar meu perfil
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </span>
          </button>

          {/* Termos */}
          <div className="mt-6 text-center">
            <p className="text-[10px] text-gray-500">
              Ao criar uma conta, você concorda com nossos{' '}
              <a href="/termos" className="font-bold text-orange-600 hover:underline">
                Termos de Uso
              </a>
            </p>
          </div>

          {/* Divisor */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-orange-200/50"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-white/40 backdrop-blur-sm text-gray-500 text-[9px] font-bold">Já tem perfil?</span>
            </div>
          </div>

          {/* Botão de login */}
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="w-full py-3.5 bg-white border-2 border-orange-200 text-gray-700 rounded-xl font-black uppercase text-sm tracking-wider hover:bg-orange-50 transition-all"
          >
            Fazer login
          </button>

          {/* Mensagem motivacional */}
          <div className="mt-8 pt-4 border-t border-orange-200/30">
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

export default function Register() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    }>
      <RegisterContent />
    </Suspense>
  )
}