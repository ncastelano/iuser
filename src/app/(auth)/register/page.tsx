'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, User, Link as LinkIcon, Mail, Lock, ArrowRight, CheckCircle2 } from 'lucide-react'

export default function Register() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [profileSlug, setProfileSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [registered, setRegistered] = useState(false)

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

        // 6. Set success state
        setRegistered(true)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex items-center justify-center min-h-screen bg-background px-4 py-12 overflow-hidden selection:bg-primary selection:text-white transition-colors duration-500">
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-primary/10 blur-[130px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-secondary/10 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--foreground)/0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <form onSubmit={handleRegister} className="relative z-10 w-full max-w-lg p-12 bg-card/40 backdrop-blur-3xl border border-border dark:border-white/5 rounded-none shadow-2xl animate-in fade-in zoom-in duration-700">
        <div className="text-center space-y-4 mb-10 flex flex-col items-center">
          <div className="flex justify-center mb-2">
            <div className="p-2.5 flex-shrink-0">
              <img src="/logo.png" alt="iUser Logo" className="h-14 md:h-16 object-contain" />
            </div>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground italic mt-2">Inicie sua Jornada Digital</p>
        </div>

        {registered ? (
          <div className="space-y-8 py-4">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-primary" />
              </div>
              <div className="flex justify-center mb-2">
                <div className="p-2.5 flex-shrink-0">
                  <img src="/logo.png" alt="iUser Logo" className="h-8 md:h-12 object-contain" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Sua jornada começou! Enviamos um link de <span className="text-foreground font-bold">ativação</span> para o seu e-mail.
                Por favor, verifique sua caixa de entrada (e a pasta de spam) para confirmar sua conta.
              </p>
            </div>
            <button
              onClick={() => router.push('/login')}
              className="w-full bg-foreground text-background py-6 rounded-none font-black uppercase text-sm tracking-widest transition-all hover:bg-neutral-200 dark:hover:bg-white"
            >
              Ir para o Login
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="p-5 mb-8 text-[10px] font-black uppercase tracking-widest text-red-500 bg-red-500/10 border border-red-500/20 rounded-none animate-shake">
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-4 flex items-center gap-2">
                  <User className="w-3 h-3" /> Nome Completo / Identidade
                </label>
                <input
                  type="text"
                  className="w-full px-8 py-4 bg-muted/30 border border-border dark:border-white/5 rounded-none text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 focus:ring-4 focus:ring-primary/5 transition-all duration-500"
                  placeholder="Como devemos lhe chamar?"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-4 flex items-center gap-2">
                  <LinkIcon className="w-3 h-3" /> Link do Perfil / Slug Único
                </label>
                <div className="flex items-center bg-muted/30 border border-border dark:border-white/5 rounded-none focus-within:border-primary/20 focus-within:ring-4 focus-within:ring-primary/5 transition-all duration-500 overflow-hidden group">
                  <span className="pl-6 pr-1 text-[10px] font-black text-muted-foreground uppercase tracking-widest h-full flex items-center">iuser.com.br/</span>
                  <input
                    type="text"
                    className="w-full py-4 pl-1 pr-6 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/30"
                    placeholder="seu-link"
                    value={profileSlug}
                    onChange={(e) => setProfileSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-4 flex items-center gap-2">
                  <Mail className="w-3 h-3" /> E-mail de Registro
                </label>
                <input
                  type="email"
                  className="w-full px-8 py-4 bg-muted/30 border border-border dark:border-white/5 rounded-none text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 focus:ring-4 focus:ring-primary/5 transition-all duration-500"
                  placeholder="Seu melhor e-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-4 flex items-center gap-2">
                    <Lock className="w-3 h-3" /> Senha
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full px-6 py-4 bg-muted/30 border border-border dark:border-white/5 rounded-none text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 focus:ring-4 focus:ring-primary/5 transition-all duration-500 pr-12"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-all"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-4 flex items-center gap-2">
                    <Lock className="w-3 h-3" /> Confirmar
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="w-full px-6 py-4 bg-muted/30 border border-border dark:border-white/5 rounded-none text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/20 focus:ring-4 focus:ring-primary/5 transition-all duration-500"
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
              className="group w-full mt-10 bg-foreground text-background py-5 rounded-none font-black uppercase text-sm tracking-widest transition-all hover:bg-neutral-200 dark:hover:bg-white active:scale-[0.96] disabled:opacity-30 shadow-2xl flex items-center justify-center gap-3"
            >
              {loading ? 'Processando...' : (
                <>
                  Finalizar Ativação <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            <p className="mt-10 text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Já faz parte da rede?{' '}
              <a href="/login" className="text-foreground hover:text-primary transition ml-2 border-b border-muted-foreground/20">Login</a>
            </p>
          </>
        )}
      </form>
    </div>
  )
}