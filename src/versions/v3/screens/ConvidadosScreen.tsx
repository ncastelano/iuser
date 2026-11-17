'use client'
// versions/v3/screens/ConvidadosScreen.tsx — CONVIDADOS iUSER (/convidados, 16/11/2026): o caminho de quem indica, numa página só.
// Antes ficava espalhado: o "Indicar e ganhar" da home só copiava o link e as comissões/rede moravam no meio do painel do perfil.
// Aqui: como funciona (3 passos), o SEU link (copiar e compartilhar), a graduação (quanto você ganha) e a rede com o saldo, o saque
// e o extrato — os mesmos blocos `Commission` de sempre (view "graduacao" e "rede"), abertos. As regras de comissão moram no banco
// (graduação; ver CLAUDE.md): aqui só se mostra. Visitante vê como funciona e o convite para entrar.
import { useRouter } from 'next/navigation'
import { Copy, Gift, Share2, UserPlus, Users, Wallet } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import Header from '@/components/Header'
import Commission from '@/components/ProfileDashboard/Commission'
import { ForceExpandedContext } from '@/hooks/usePersistedExpanded'
import { handleShareLink } from '@/lib/share'
import { toast } from '@/lib/toast'

const PURPLE = '#7c3aed'

const STEPS = [
    { icon: Share2, title: 'Mande o seu link', text: 'Pelo WhatsApp, nas redes ou mostre o QR: cada pessoa que entra por ele fica na sua rede.' },
    { icon: UserPlus, title: 'A pessoa cria a conta', text: 'Ela usa o iUser como quiser: compra, vende, dirige ou oferece serviços.' },
    { icon: Wallet, title: 'Você ganha comissão', text: 'Quando um convidado paga o plano do iUser, uma parte vai para o seu saldo. Quanto maior a sua graduação, maior a parte.' },
]

export default function ConvidadosScreen() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, profileSlug, loading } = useProfile()
    const link = typeof window !== 'undefined' && profileSlug ? `${window.location.origin}/convite?ref=${profileSlug}` : ''
    const goBack = () => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/') }

    const copy = async () => {
        try { await navigator.clipboard.writeText(link); toast.success('Link de convite copiado!') }
        catch { toast.error('Não deu para copiar. Segure no link para copiar.') }
    }
    const share = () => { void handleShareLink({ url: link, title: 'Convidar para o iUser', text: 'Entra no iUser pelo meu link: compre, venda, peça motorista e ofereça serviços na sua cidade.' }) }

    return (
        <div className="pb-12">
            <Header title="Convidados iUser" showBack onBack={goBack} />

            {/* ===== Convite: o seu link ===== */}
            <section className="mt-2 rounded-3xl p-5 text-white flex flex-col gap-3" style={{ background: `linear-gradient(140deg, ${PURPLE}, #db2777)`, boxShadow: '0 12px 30px -12px #7c3aed99' }}>
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.18)' }}><Gift size={22} /></span>
                <div>
                    <h2 className="text-xl font-black leading-tight">Convide e ganhe com o iUser</h2>
                    <p className="text-[13px] leading-snug mt-1 text-white/85">Quem entra pelo seu link fica na sua rede, e você ganha uma parte do que essas pessoas pagam no plano do iUser.</p>
                </div>
                {userId && link ? (
                    <>
                        <div className="rounded-2xl px-3 py-2.5 text-[12.5px] font-bold truncate select-all" style={{ background: 'rgba(255,255,255,0.16)' }}>{link.replace(/^https?:\/\//, '')}</div>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={copy} className="h-11 rounded-full flex items-center justify-center gap-2 text-[13px] font-black" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.5)' }}><Copy size={16} /> Copiar link</button>
                            <button onClick={share} className="h-11 rounded-full flex items-center justify-center gap-2 text-[13px] font-black" style={{ background: '#fff', color: PURPLE }}><Share2 size={16} /> Compartilhar</button>
                        </div>
                    </>
                ) : !loading ? (
                    <button onClick={() => router.push('/login?redirect=/convidados')} className="h-11 rounded-full text-[13px] font-black" style={{ background: '#fff', color: PURPLE }}>Entrar para pegar o meu link</button>
                ) : null}
            </section>

            {/* ===== Como funciona ===== */}
            <section className="mt-5 flex flex-col gap-2.5">
                <h3 className="text-[13px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Como funciona</h3>
                {STEPS.map((s, i) => {
                    const Icon = s.icon
                    return (
                        <div key={s.title} className="rounded-2xl p-3.5 flex items-start gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                            <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 relative" style={{ background: `${PURPLE}1a`, color: PURPLE }}>
                                <Icon size={18} />
                                <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full text-[10px] font-black text-white flex items-center justify-center" style={{ background: PURPLE }}>{i + 1}</span>
                            </span>
                            <span className="min-w-0">
                                <span className="block text-[14px] font-black leading-tight" style={{ color: colors.textPrimary }}>{s.title}</span>
                                <span className="block text-[12px] leading-snug mt-0.5" style={{ color: colors.textSecondary }}>{s.text}</span>
                            </span>
                        </div>
                    )
                })}
            </section>

            {/* ===== Graduação, rede, saldo e saque (os mesmos blocos do antigo painel do perfil, já abertos) ===== */}
            {userId && (
                <ForceExpandedContext.Provider value>
                    <section className="mt-6">
                        <h3 className="text-[13px] font-black uppercase tracking-wide mb-1 flex items-center gap-1.5" style={{ color: colors.textSecondary }}><Users size={14} /> A sua rede</h3>
                        <Commission userId={userId} profileSlug={profileSlug || undefined} view="graduacao" />
                        <div id="detalhes-da-rede">
                            <Commission userId={userId} profileSlug={profileSlug || undefined} view="rede" />
                        </div>
                    </section>
                </ForceExpandedContext.Provider>
            )}
        </div>
    )
}
