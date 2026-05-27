// app/(main)/recuperar-senha/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Lock, ArrowRight, Sparkles, KeyRound } from 'lucide-react'
import Link from 'next/link'
import AnimatedBackground from '@/components/AnimatedBackground'

export default function RecoverPassword() {
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [hasSession, setHasSession] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    const handleRecoverySession = async () => {
      if (window.location.hash) {
        const hash = window.location.hash
        const params = new URLSearchParams(hash.replace('#', ''))

        if (params.get('type') === 'recovery') {
          const accessToken = params.get('access_token')
          const refreshToken = params.get('refresh_token')

          if (accessToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
            })

            if (!error) {
              setHasSession(true)
              window.history.replaceState({}, '', window.location.pathname)
            }
          }
        }
      }
      setCheckingSession(false)
    }

    handleRecoverySession()
  }, [supabase])

  const validatePassword = (pass: string) => {
    if (pass.length < 8) return 'A senha deve ter no mínimo 8 caracteres'
    if (!/[A-Z]/.test(pass)) return 'Inclua pelo menos uma letra maiúscula'
    if (!/[a-z]/.test(pass)) return 'Inclua pelo menos uma letra minúscula'
    if (!/[0-9]/.test(pass)) return 'Inclua pelo menos um número'
    return null
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validações
    const passwordError = validatePassword(password)
    if (passwordError) {
      setMessage(passwordError)
      setMessageType('error')
      return
    }

    if (password !== confirmPassword) {
      setMessage('As senhas não coincidem')
      setMessageType('error')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      })

      if (error) throw error

      setMessage('✅ Senha atualizada com sucesso! Redirecionando...')
      setMessageType('success')

      setTimeout(() => {
        window.location.href = '/login'
      }, 2000)

    } catch (error: any) {
      setMessage(`❌ ${error.message}`)
      setMessageType('error')
    } finally {
      setLoading(false)
    }
  }

  // Loading state
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
      </div>
    )
  }

  // Link inválido
  if (!hasSession) {
    return (
      <div className="relative min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 flex items-center justify-center p-4">
        <AnimatedBackground />
        <div className="relative z-10 w-full max-w-md">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-orange-200/50 text-center">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg">
                <KeyRound className="w-10 h-10 text-white" />
              </div>
            </div>

            <h2 className="text-2xl font-black text-gray-900 mb-3">
              Link Inválido
            </h2>
            <p className="text-gray-600 mb-8">
              Este link de recuperação é inválido ou já expirou. Solicite um novo para continuar.
            </p>

            <Link
              href="/recuperar-senha"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black uppercase text-sm rounded-xl hover:shadow-lg hover:scale-105 transition-all"
            >
              Solicitar Novo Link
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Formulário de nova senha
  return (
    <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 pb-32">
      <AnimatedBackground />

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <form onSubmit={handleUpdatePassword} className="w-full max-w-md mb-8">
          {/* Logo Avatar Circular */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-xl">
                <img src="/logo.png" alt="iUser" className="w-12 h-12 object-contain rounded-full" />
              </div>
            </div>

            <h1 className="text-3xl font-black bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent mb-2">
              Nova Senha
            </h1>
            <p className="text-sm text-gray-600">
              Crie uma senha forte para sua conta
            </p>

            {/* Feature badges */}
            <div className="flex items-center justify-center gap-4 mt-4">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-orange-600 bg-orange-100 px-3 py-1 rounded-full">
                <Lock className="w-3 h-3" />
                <span>Segura</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-100 px-3 py-1 rounded-full">
                <Sparkles className="w-3 h-3" />
                <span>Protegida</span>
              </div>
            </div>
          </div>

          {/* Mensagem de feedback */}
          {message && (
            <div className={`mb-6 p-3 text-xs font-bold rounded-xl ${messageType === 'success'
              ? 'text-green-600 bg-green-50 border border-green-200'
              : 'text-red-600 bg-red-50 border border-red-200'
              }`}>
              {message}
            </div>
          )}

          {/* Campos do formulário */}
          <div className="space-y-5">
            {/* Nova Senha */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2 ml-1">
                <Lock className="w-4 h-4 text-orange-500" />
                Nova Senha
              </label>
              <div className="relative group">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  placeholder="Mínimo 8 caracteres"
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
              {/* Indicador de força */}
              {password && (
                <div className="mt-2 flex gap-1">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`h-1 flex-1 rounded-full transition-all ${password.length >= level * 2 && /[A-Z]/.test(password) && /[0-9]/.test(password)
                        ? 'bg-green-500'
                        : password.length >= level * 2
                          ? 'bg-orange-400'
                          : 'bg-orange-200/50'
                        }`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Confirmar Senha */}
            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-gray-700 flex items-center gap-2 ml-1">
                <Lock className="w-4 h-4 text-orange-500" />
                Confirmar Senha
              </label>
              <div className="relative group">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="w-full px-4 py-3 bg-white border-2 border-orange-200 rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                  placeholder="Digite a senha novamente"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-orange-500 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs font-bold text-red-500 ml-1">As senhas não coincidem</p>
              )}
            </div>
          </div>

          {/* Botão de Atualizar */}
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
                  Atualizar Senha
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </span>
          </button>

          {/* Link Voltar */}
          <div className="mt-8 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-orange-600 transition-colors"
            >
              ← Voltar para o login
            </Link>
          </div>

          {/* Footer message */}
          <div className="mt-8 pt-6 pb-4 border-t border-orange-200/30">
            <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-orange-200/50">
              <p className="text-[11px] text-gray-600 text-center leading-relaxed">
                ✨ <span className="font-black text-orange-600">Sua segurança é nossa prioridade.</span><br />
                Use uma senha que só você saiba.
              </p>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}