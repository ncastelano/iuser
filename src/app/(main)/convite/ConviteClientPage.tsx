// app/(main)/convite/page.tsx

'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import { PlanRingFrame, useAvatarBorder } from '@/components/PlanAvatarRing'
import ShareLinkDialog from '@/components/ShareLinkDialog'
import { HomeGlassCard, HOME_GRADIENT } from '@/app/(main)/inicio/sections/HomeSectionKit'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import { normalizeReferralSlug } from '@/lib/referralCapture'

function ConviteContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { colors } = useTheme()
    const { userId, loading: profileLoading } = useProfile()
    const [shareOpen, setShareOpen] = useState(false)
    const profileSlug = normalizeReferralSlug(searchParams.get('ref'))

    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [inviter, setInviter] = useState<any>(null)
    const [currentUser, setCurrentUser] = useState<any>(null)
    // Quem já convidou a conta logada (pra explicar por que ela não aceita outro convite)
    const [currentUpline, setCurrentUpline] = useState<{ name: string | null; profileSlug: string | null } | null>(null)
    const [copied, setCopied] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const accentColor = colors.accent
    const textPrimary = colors.textPrimary
    const textSecondary = colors.textSecondary
    const borderColor = colors.border


    useEffect(() => {
        if (profileLoading) return

        const loadPageData = async () => {
            console.log('🔍 Carregando página de convite...')
            console.log('📝 ProfileSlug da URL:', profileSlug)

            if (!profileSlug) {
                console.log('ℹ️ Nenhum profileSlug na URL')
                setLoading(false)
                return
            }

            try {
                // Buscar informações do convidante
                console.log('🔍 Buscando convidante para o slug:', profileSlug)

                const { data: inviterData, error: inviterError } = await supabase
                    .from('profiles')
                    .select('id, name, avatar_url, "profileSlug"')
                    .eq('profileSlug', profileSlug)
                    .maybeSingle()

                if (inviterError) {
                    console.error('❌ Erro ao buscar convidante:', inviterError)
                    setError('Erro ao carregar convite')
                    setLoading(false)
                    return
                }

                if (!inviterData) {
                    console.warn('⚠️ Convidante não encontrado para o slug:', profileSlug)
                    setError('Perfil não encontrado')
                    setLoading(false)
                    return
                }

                console.log('✅ Convidante encontrado:', inviterData.name, inviterData.id)
                setInviter(inviterData)

                // Abrir o link de convite já guarda quem convidou (7 dias): se a pessoa se cadastrar depois,
                // por qualquer tela (não só pelo botão desta página), ela entra como convidada.
                if (!userId) {
                    fetch('/api/set-referral-cookie', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ referralSlug: inviterData.profileSlug, force: true }),
                    }).catch(() => {})
                }

                // Verificar se o usuário está logado
                if (userId) {
                    console.log('👤 Usuário logado:', userId)

                    const { data: currentProfile, error: profileError } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', userId)
                        .maybeSingle()

                    if (profileError) {
                        console.error('❌ Erro ao buscar perfil do usuário:', profileError)
                    }

                    if (currentProfile) {
                        console.log('✅ Perfil do usuário encontrado:', currentProfile.name)
                        setCurrentUser(currentProfile)
                        if (currentProfile.upline_id) {
                            const { data: up } = await supabase
                                .from('profiles')
                                .select('name, "profileSlug"')
                                .eq('id', currentProfile.upline_id)
                                .maybeSingle()
                            setCurrentUpline(up || null)
                        }
                    } else {
                        console.warn('⚠️ Perfil do usuário não encontrado para o ID:', userId)
                        setCurrentUser(null)
                    }
                } else {
                    console.log('ℹ️ Usuário não está logado')
                }

            } catch (error) {
                console.error('❌ Erro ao carregar página:', error)
                setError('Erro ao carregar convite')
            } finally {
                setLoading(false)
            }
        }

        loadPageData()
    }, [profileSlug, userId, profileLoading])

    // 🔥 FUNÇÃO ATUALIZADA: Salvar cookie antes de redirecionar
    const handleJoinNotLogged = async () => {
        console.log('🚀 handleJoinNotLogged iniciado')
        setActionLoading(true)

        try {
            // 1. Salvar o cookie com o slug do convite
            if (inviter?.profileSlug) {
                console.log('📝 Salvando cookie para o slug:', inviter.profileSlug)

                const response = await fetch('/api/set-referral-cookie', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        referralSlug: inviter.profileSlug,
                        // Aceitar um convite explícito sempre vale, mesmo que
                        // a pessoa já carregasse um convite passivo de outra
                        // loja/perfil visitado antes.
                        force: true,
                    }),
                })

                if (!response.ok) {
                    const errorData = await response.json()
                    console.error('❌ Erro ao salvar cookie:', errorData)
                    toast.error('Erro ao processar convite')
                    setActionLoading(false)
                    return
                }

                console.log('✅ Cookie salvo com sucesso:', inviter.profileSlug)
            } else {
                console.warn('⚠️ Inviter sem profileSlug')
            }

            // 2. Redirecionar para o registro com o ref
            const params = new URLSearchParams({
                ref: inviter.profileSlug
            })
            const redirectUrl = `/cadastrar?${params.toString()}`
            console.log('🔀 Redirecionando para:', redirectUrl)

            router.push(redirectUrl)
        } catch (error) {
            console.error('❌ Erro ao redirecionar:', error)
            toast.error('Erro ao processar convite')
        } finally {
            setActionLoading(false)
        }
    }

    // 🔥 FUNÇÃO ATUALIZADA: Vincular usuário logado
    const handleBindNetwork = async () => {
        if (!currentUser || !inviter) {
            console.warn('⚠️ currentUser ou inviter não disponível')
            return
        }

        console.log('🔗 Vinculando usuário à rede...')
        console.log('👤 Usuário:', currentUser.id, currentUser.name)
        console.log('👤 Inviter:', inviter.id, inviter.name)

        setActionLoading(true)

        try {
            // Verificar se o usuário já tem upline
            if (currentUser.upline_id) {
                console.log('ℹ️ Usuário já tem upline:', currentUser.upline_id)
                toast.info('Você já está vinculado a uma rede')
                setActionLoading(false)
                return
            }

            // O vínculo é feito por uma função do banco (só a própria conta, só se ainda não foi convidada,
            // sem ciclo) — um UPDATE direto em profiles.upline_id é barrado pelo banco.
            const { error } = await supabase.rpc('link_user_to_network', {
                p_user_id: currentUser.id,
                p_upline_id: inviter.id,
            })

            if (error) {
                console.error('❌ Erro ao vincular via RPC:', error)
                toast.error(error.message || 'Não foi possível aceitar o convite.')
                setActionLoading(false)
                return
            }

            toast.success(`🎉 Bem-vindo! Você agora faz parte da rede de ${inviter.name}!`)

            setTimeout(() => {
                router.push('/')
            }, 1500)

        } catch (error) {
            console.error('❌ Erro ao vincular:', error)
            toast.error('Erro ao processar convite')
        } finally {
            setActionLoading(false)
        }
    }

    const inviteLink = inviter ? `${typeof window !== 'undefined' ? window.location.origin : ''}/convite?ref=${inviter.profileSlug}` : ''
    const inviteText = inviter ? `@${inviter.profileSlug} te chama pro iUser — compre, venda, preste serviço ou dirija, tudo numa plataforma só, sem taxa escondida.\n\nEntre pelo meu link e comece agora:` : ''

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(inviteLink)
            setCopied(true)
            toast.success('Link copiado!')
            setTimeout(() => setCopied(false), 3000)
        } catch {
            toast.error('Erro ao copiar link')
        }
    }

    // ===== Visual igual ao da home: fundo animado, Header "iUser" e cartões de vidro =====
    const GRADIENT = HOME_GRADIENT
    const glass: React.CSSProperties = { border: '1px solid rgba(249,115,22,0.35)', boxShadow: '0 8px 32px rgba(249,115,22,0.16)' }
    const primaryBtn = 'w-full py-3.5 px-5 rounded-full text-sm font-black text-white transition-transform active:scale-95 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2'
    const primaryStyle: React.CSSProperties = { background: GRADIENT, boxShadow: '0 4px 14px #f9731660' }
    const ghostBtn = 'w-full py-3 px-5 rounded-full text-sm font-bold transition-transform active:scale-95 hover:scale-[1.02] flex items-center justify-center gap-2'
    const ghostStyle: React.CSSProperties = { background: 'transparent', border: `1px solid ${borderColor}`, color: textPrimary }

    const shell = (children: React.ReactNode) => (
        <ConviteShell>{children}</ConviteShell>
    )

    // Carregando
    if (loading) {
        return shell(
            <div className="flex flex-col items-center gap-3 py-16">
                <Spinner size={40} color={accentColor} />
                <p className="text-sm" style={{ color: textSecondary }}>Carregando convite...</p>
            </div>
        )
    }

    // Sem profileSlug na URL
    if (!profileSlug) {
        return shell(
            <>
                <HomeGlassCard className="p-6 text-center" style={glass}>
                    <h1 className="text-2xl font-black" style={{ color: textPrimary }}>Link de convite</h1>
                    <p className="text-sm mt-2" style={{ color: textSecondary }}>
                        Para aceitar um convite, você precisa de um link válido com o nome de quem te convidou.
                    </p>
                    <div className="rounded-2xl p-4 mt-5 text-left" style={{ background: `${accentColor}10`, border: `1px solid ${accentColor}30` }}>
                        <p className="text-xs mb-1" style={{ color: textSecondary }}>Exemplo:</p>
                        <code className="text-sm font-mono break-all" style={{ color: accentColor }}>iuser.com.br/convite?ref=joaosilva</code>
                    </div>
                </HomeGlassCard>
                <button onClick={() => router.push('/')} className={primaryBtn} style={primaryStyle}>Explorar iUser</button>
            </>
        )
    }

    // Convite inválido
    if (error || !inviter) {
        return shell(
            <>
                <HomeGlassCard className="p-6 text-center" style={glass}>
                    <h1 className="text-2xl font-black" style={{ color: textPrimary }}>Convite inválido</h1>
                    <p className="text-sm mt-2" style={{ color: textSecondary }}>Este link de convite não existe ou expirou.</p>
                </HomeGlassCard>
                <button onClick={() => router.push('/')} className={primaryBtn} style={primaryStyle}>Explorar iUser</button>
            </>
        )
    }

    const isSameUser = currentUser?.id === inviter.id
    const chip = (text: string) => (
        <span
            key={text}
            className="text-[11px] font-bold px-3 py-1.5 rounded-full text-center"
            style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.35)', color: accentColor }}
        >
            {text}
        </span>
    )

    return shell(
        <>
            {/* Quem convidou */}
            <HomeGlassCard className="p-6 flex flex-col items-center text-center gap-4" style={glass}>
                <InviterAvatar id={inviter.id} url={inviter.avatar_url} name={inviter.name} />
                <div>
                    <h1 className="text-2xl font-black leading-tight" style={{ color: textPrimary }}>{inviter.name}</h1>
                    <p
                        className="text-sm font-black mt-1"
                        style={{ background: GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
                    >
                        @{inviter.profileSlug} te chamou para o iUser
                    </p>
                </div>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                    {chip('Sua loja')}
                    {chip('Venda em tempo real')}
                    {chip('Taxa 0% no Pré-pago ou pague só pelo que usar no Pós-pago')}
                </div>
            </HomeGlassCard>

            {/* O que fazer com o convite */}
            <HomeGlassCard className="p-6 flex flex-col gap-3" style={glass}>
                <div className="text-center mb-1">
                    <h2 className="text-lg font-black" style={{ color: textPrimary }}>Convite exclusivo</h2>
                    <p className="text-xs mt-0.5" style={{ color: textSecondary }}>Entre e faça parte da rede de {inviter.name}</p>
                </div>

                {/* NÃO LOGADO */}
                {!currentUser && (
                    <>
                        <button onClick={handleJoinNotLogged} disabled={actionLoading} className={primaryBtn} style={primaryStyle}>
                            {actionLoading ? <><Spinner size={16} /> Processando...</> : 'Criar conta e entrar'}
                        </button>
                        <button
                            onClick={() => router.push(`/login?redirect=${encodeURIComponent(`/convite?ref=${profileSlug}`)}`)}
                            className={ghostBtn}
                            style={ghostStyle}
                        >
                            Já tenho conta · Entrar
                        </button>
                    </>
                )}

                {/* LOGADO COMO O PRÓPRIO DONO DO LINK */}
                {isSameUser && (
                    <>
                        <p className="text-sm text-center font-bold" style={{ color: textPrimary }}>Este é o seu link de convite!</p>
                        <p className="text-xs text-center -mt-1" style={{ color: textSecondary }}>Envie para novos parceiros.</p>
                        <button onClick={() => setShareOpen(true)} className={primaryBtn} style={primaryStyle}>Compartilhar convite</button>
                        <button onClick={handleCopyLink} className={ghostBtn} style={ghostStyle}>
                            {copied ? <span style={{ color: '#10b981' }}>Copiado!</span> : 'Copiar link'}
                        </button>
                    </>
                )}

                {/* LOGADO EM OUTRA CONTA */}
                {currentUser && !isSameUser && (
                    currentUser.upline_id ? (
                        <>
                            <p className="text-sm text-center font-bold" style={{ color: textPrimary }}>Você já tem uma rede</p>
                            <p className="text-xs text-center" style={{ color: textSecondary }}>
                                {currentUpline
                                    ? <>Sua conta já foi convidada por <b>{currentUpline.profileSlug ? `@${currentUpline.profileSlug}` : currentUpline.name}</b>, então não aceita outro convite.</>
                                    : 'Sua conta atual já está conectada a um líder, então não aceita outro convite.'}
                                {' '}Quem entra pelo link de convite já se cadastra ligado a quem convidou.
                            </p>
                            <button onClick={() => router.push('/')} className={ghostBtn} style={ghostStyle}>Voltar ao início</button>
                        </>
                    ) : (
                        <button onClick={handleBindNetwork} disabled={actionLoading} className={primaryBtn} style={primaryStyle}>
                            {actionLoading ? <><Spinner size={16} /> Conectando...</> : 'Vincular minha conta'}
                        </button>
                    )
                )}
            </HomeGlassCard>

            {/* Conhecer o iUser */}
            <button onClick={() => router.push('/')} className="text-left active:scale-[0.99] transition-transform">
                <HomeGlassCard className="p-4 flex items-center gap-3" style={glass}>
                    <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: GRADIENT, boxShadow: '0 4px 12px #f9731650' }}>
                        <img src="/logotransparente.png" alt="" className="h-7 w-7 object-contain rounded-full" />
                    </span>
                    <span className="flex-1 min-w-0">
                        <span className="block text-sm font-black" style={{ color: textPrimary }}>Conhecer o iUser</span>
                        <span className="block text-xs" style={{ color: textSecondary }}>Descubra o que as outras pessoas têm a oferecer</span>
                    </span>
                    <span className="text-xs font-black" style={{ color: accentColor }}>Entrar</span>
                </HomeGlassCard>
            </button>

            <p className="text-center text-[11px]" style={{ color: textSecondary }}>
                Ao entrar, você concorda com os{' '}
                <a href="/termos" className="font-bold hover:underline" style={{ color: accentColor }}>Termos de Uso</a>
            </p>

            <ShareLinkDialog open={shareOpen} onClose={() => setShareOpen(false)} url={inviteLink} title="Convidar para o iUser" text={inviteText} />
        </>
    )
}

/** Foto de quem convidou, sempre com borda: a que a pessoa usa (girando) ou, sem nenhuma, o degradê laranja→vermelho */
function InviterAvatar({ id, url, name }: { id: string; url?: string | null; name?: string | null }) {
    const border = useAvatarBorder(id)
    const photo = url ? (
        <img src={url} alt={name || ''} className="w-24 h-24 rounded-full object-cover block" />
    ) : (
        <span className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-black text-white" style={{ background: HOME_GRADIENT }}>
            {name?.charAt(0) || '?'}
        </span>
    )
    return (
        <div className="relative flex items-center justify-center" style={{ filter: 'drop-shadow(0 0 22px rgba(249,115,22,0.45))' }}>
            {border ? (
                <PlanRingFrame colors={border} width={4}>{photo}</PlanRingFrame>
            ) : (
                <span className="rounded-full p-1 block" style={{ background: HOME_GRADIENT }}>
                    <span className="block rounded-full p-0.5 bg-white/90">{photo}</span>
                </span>
            )}
        </div>
    )
}

/** Casco da página igual ao da home: fundo animado + Header "iUser" com "Olá, @..." + coluna central */
function ConviteShell({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const { colors } = useTheme()
    const { bgMode, customBgUrl, avatarUrl, profileSlug, loading } = useProfile()
    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>
            <main className="relative z-10 min-h-dvh pb-28">
                <Header
                    title="iUser"
                    showBack={false}
                    greeting={`Olá, ${loading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={loading}
                    showSearch={false}
                    profileSlug={profileSlug}
                    onHomeClick={() => router.push('/')}
                />
                <div className="px-4 pt-6 flex justify-center">
                    <div className="w-full max-w-md flex flex-col gap-4">{children}</div>
                </div>
            </main>
        </div>
    )
}

// Página principal com Suspense
export default function ConviteClientPage() {
    return (
        <Suspense fallback={<ConviteShell><div className="flex justify-center py-16"><Spinner size={40} /></div></ConviteShell>}>
            <ConviteContent />
        </Suspense>
    )
}
