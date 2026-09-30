// app/(main)/modelodehomepage/page.tsx
//
// MODELO DE HOMEPAGE — protótipo visual, sem dados reais e sem navegação
// funcional. Existe só pra mostrar uma proposta de redesign da home do
// iUser: mesmas peças (categorias, atalhos de ação, radar, produtos,
// publicações, pessoas, canal do motorista, planos, abas de perfil/loja),
// com um tratamento visual mais rico. Todo conteúdo abaixo é fictício.
'use client'

import {
    Search, MapPin, ShoppingCart, Bell, ChevronRight, Radar as RadarIcon,
    Heart, MessageCircle, Star, Car, Wrench, Megaphone, Users, Gift,
    LayoutDashboard, Store as StoreIcon, Sparkles, Crown, Zap, Check,
    Clock, Navigation, type LucideIcon,
} from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { categorias } from '@/lib/categorias'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== DADOS FICTÍCIOS — só pra preencher o modelo visualmente ===== //
const sampleProducts = [
    { name: 'Combo Burger Duplo', store: 'Burger House', price: 34.9, color: '#f97316' },
    { name: 'Tênis Runner Pro', store: 'Loja do Zé', price: 219.9, color: '#3b82f6' },
    { name: 'Corte + Barba', store: 'Studio Hair', price: 60, color: '#ec4899' },
    { name: 'Kit Ferramentas 45pç', store: 'Casa & Cia', price: 189, color: '#a855f7' },
    { name: 'Ração Premium 10kg', store: 'Pet Amigo', price: 129.9, color: '#22c55e' },
]

const samplePosts = [
    { author: 'Studio Hair', likes: 128, color: '#ec4899' },
    { author: 'Burger House', likes: 342, color: '#f97316' },
    { author: 'Loja do Zé', likes: 76, color: '#3b82f6' },
    { author: 'Pet Amigo', likes: 201, color: '#22c55e' },
]

const samplePeople = [
    { name: 'Camila Souza', role: 'Designer', color: '#f97316' },
    { name: 'Rafael Lima', role: 'Fotógrafo', color: '#3b82f6' },
    { name: 'Bia Torres', role: 'Cabeleireira', color: '#ec4899' },
    { name: 'João Pedro', role: 'Motorista', color: '#22c55e' },
    { name: 'Marina Alves', role: 'Nutricionista', color: '#a855f7' },
]

const sampleOpenRides = [
    { from: 'Centro', to: 'Aeroporto', price: 28, eta: '4 min' },
    { from: 'Shopping Rio Madeira', to: 'Bairro Flodoaldo', price: 19, eta: '7 min' },
]

const featuredActions = [
    { label: 'Pedir motorista', icon: Car },
    { label: 'Solicitar serviço', icon: Wrench },
    { label: 'Publicar serviço', icon: Megaphone },
]

const plans = [
    {
        name: 'Grátis',
        price: 'R$ 0',
        period: '/sempre',
        highlight: false,
        features: ['Perfil e loja básica', 'Até 10 produtos', 'Suporte por e-mail'],
    },
    {
        name: 'Pro',
        price: 'R$ 29',
        period: '/mês',
        highlight: true,
        features: ['Produtos ilimitados', 'Destaque nas buscas', 'Estatísticas completas', 'Suporte prioritário'],
    },
    {
        name: 'Empresas',
        price: 'R$ 89',
        period: '/mês',
        highlight: false,
        features: ['Múltiplas lojas', 'Equipe com permissões', 'Relatórios avançados'],
    },
]

// Pequeno cabeçalho de seção reutilizado em todo o modelo: ícone + título +
// "ver tudo" decorativo (não navega pra lugar nenhum, é só modelo).
function SectionHeader({
    icon: Icon,
    title,
    subtitle,
}: {
    icon: LucideIcon
    title: string
    subtitle?: string
}) {
    const { colors } = useTheme()
    return (
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
                <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: GRADIENT, boxShadow: '0 4px 12px #f9731650' }}
                >
                    <Icon size={18} color="#fff" strokeWidth={2.25} />
                </div>
                <div>
                    <h2 className="text-lg font-black leading-tight" style={{ color: colors.textPrimary }}>{title}</h2>
                    {subtitle && (
                        <p className="text-xs opacity-60" style={{ color: colors.textPrimary }}>{subtitle}</p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-0.5 text-xs font-bold opacity-50 flex-shrink-0" style={{ color: colors.textPrimary }}>
                ver tudo <ChevronRight size={14} />
            </div>
        </div>
    )
}

function GlassCard({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
    const { colors } = useTheme()
    return (
        <div
            className={`rounded-3xl ${className}`}
            style={{
                background: colors.name === 'claro' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.05)',
                backdropFilter: 'blur(16px) saturate(180%)',
                WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                border: `1px solid ${colors.border}`,
                boxShadow: colors.shadow,
                ...style,
            }}
        >
            {children}
        </div>
    )
}

export default function ModeloDeHomepage() {
    const { colors } = useTheme()

    return (
        <div className="min-h-screen pb-16" style={{ background: colors.background }}>
            {/* ===== FUNDO DECORATIVO — blobs suaves de gradiente, só no topo ===== */}
            <div className="relative overflow-hidden">
                <div
                    className="absolute -top-24 -left-20 w-72 h-72 rounded-full pointer-events-none"
                    style={{ background: GRADIENT, opacity: 0.18, filter: 'blur(60px)' }}
                />
                <div
                    className="absolute -top-10 -right-24 w-80 h-80 rounded-full pointer-events-none"
                    style={{ background: '#3b82f6', opacity: 0.14, filter: 'blur(70px)' }}
                />

                <div className="relative px-4 pt-6 pb-2 max-w-2xl mx-auto">
                    {/* ===== BARRA SUPERIOR: logo + busca + notificação/carrinho ===== */}
                    <div className="flex items-center gap-2.5 mb-5">
                        <div
                            className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-white text-lg"
                            style={{ background: GRADIENT, boxShadow: '0 4px 14px #f9731650' }}
                        >
                            i
                        </div>

                        <div
                            className="flex-1 flex items-center gap-2 px-4 h-11 rounded-full"
                            style={{ background: `${colors.textPrimary}0d`, border: `1.5px solid ${colors.border}` }}
                        >
                            <Search size={16} style={{ color: colors.textPrimary, opacity: 0.5 }} />
                            <span className="text-sm opacity-50 truncate" style={{ color: colors.textPrimary }}>
                                Procurar, espetinho, cabeleireiro...
                            </span>
                        </div>

                        <button
                            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 relative"
                            style={{ background: `${colors.textPrimary}0d`, border: `1.5px solid ${colors.border}` }}
                        >
                            <Bell size={17} style={{ color: colors.textPrimary }} />
                            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center text-white" style={{ background: GRADIENT }}>3</span>
                        </button>
                        <button
                            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 relative"
                            style={{ background: GRADIENT, boxShadow: '0 4px 12px #f9731650' }}
                        >
                            <ShoppingCart size={17} color="#fff" />
                        </button>
                    </div>

                    {/* ===== SAUDAÇÃO + LOCALIZAÇÃO ===== */}
                    <div className="flex items-start justify-between gap-2 mb-4">
                        <h1 className="text-2xl font-black leading-tight" style={{ color: colors.textPrimary }}>
                            Olá, @natan 👋
                        </h1>
                        <button
                            className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0"
                            style={{ background: `${colors.textPrimary}0d`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                        >
                            <MapPin size={13} />
                            Rua São Miguel
                        </button>
                    </div>

                    {/* ===== ABAS: acesso ao perfil e às lojas (profiledashboard/storedashboard) ===== */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                        <button
                            className="flex items-center gap-2 pl-1.5 pr-4 py-1.5 rounded-full flex-shrink-0 text-white font-bold text-sm"
                            style={{ background: GRADIENT, boxShadow: '0 3px 10px #f9731650' }}
                        >
                            <span className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs" style={{ background: 'rgba(255,255,255,0.25)' }}>N</span>
                            @natan
                        </button>
                        <button
                            className="flex items-center gap-2 px-4 py-1.5 rounded-full flex-shrink-0 font-bold text-sm"
                            style={{ background: `${colors.textPrimary}0d`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                        >
                            <Gift size={15} />
                            Administrador
                        </button>
                        <button
                            className="flex items-center gap-2 px-4 py-1.5 rounded-full flex-shrink-0 font-bold text-sm"
                            style={{ background: `${colors.textPrimary}0d`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
                        >
                            <LayoutDashboard size={15} />
                            Minha Loja
                            <span className="w-2 h-2 rounded-full" style={{ background: '#22c55e' }} />
                        </button>
                        <button
                            className="flex items-center gap-2 px-4 py-1.5 rounded-full flex-shrink-0 font-bold text-sm border-dashed"
                            style={{ color: colors.accent, border: `1.5px dashed ${colors.accent}` }}
                        >
                            <StoreIcon size={15} />
                            Nova loja
                        </button>
                    </div>
                </div>
            </div>

            <div className="px-4 max-w-2xl mx-auto flex flex-col gap-8 mt-6">

                {/* ===== CATEGORIAS + AÇÕES EM DESTAQUE ===== */}
                <section>
                    <SectionHeader icon={Sparkles} title="O que você precisa?" subtitle="Ações rápidas e categorias" />
                    <GlassCard className="p-5">
                        <div className="grid grid-cols-3 gap-2.5 mb-5">
                            {featuredActions.map((action) => {
                                const Icon = action.icon
                                return (
                                    <div
                                        key={action.label}
                                        className="flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-2xl"
                                        style={{ background: GRADIENT, boxShadow: '0 4px 14px #f9731650' }}
                                    >
                                        <Icon size={22} color="#fff" strokeWidth={2} />
                                        <span className="text-[11px] font-black text-center leading-tight text-white">
                                            {action.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="h-px mb-5" style={{ background: colors.border }} />

                        <div className="flex flex-wrap gap-3 justify-center">
                            {categorias.slice(0, 9).map((cat) => {
                                const Icon = cat.icone
                                return (
                                    <div key={cat.slug} className="flex flex-col items-center gap-1.5 w-[72px] flex-shrink-0">
                                        <div
                                            className="w-14 h-14 flex items-center justify-center rounded-2xl"
                                            style={{ background: `${cat.color}18` }}
                                        >
                                            <Icon className="w-7 h-7" style={{ color: cat.color }} strokeWidth={1.6} />
                                        </div>
                                        <span className="text-[10px] font-bold text-center leading-tight" style={{ color: colors.textPrimary }}>
                                            {cat.nome}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    </GlassCard>
                </section>

                {/* ===== RADAR ===== */}
                <section>
                    <div
                        className="relative rounded-3xl p-6 overflow-hidden"
                        style={{ background: 'linear-gradient(135deg, #111827, #1f2937)', boxShadow: colors.shadow }}
                    >
                        {/* anéis do radar, decorativos */}
                        <div className="absolute -right-10 top-1/2 -translate-y-1/2 pointer-events-none">
                            {[140, 100, 60].map((size, i) => (
                                <div
                                    key={size}
                                    className="absolute rounded-full border"
                                    style={{
                                        width: size, height: size,
                                        left: -size / 2, top: -size / 2,
                                        borderColor: `rgba(249,115,22,${0.35 - i * 0.08})`,
                                    }}
                                />
                            ))}
                            <div className="absolute w-3 h-3 rounded-full" style={{ left: -6, top: -6, background: GRADIENT, boxShadow: '0 0 16px #f97316' }} />
                        </div>

                        <div className="relative z-10 max-w-[70%]">
                            <div className="flex items-center gap-2 mb-2">
                                <RadarIcon size={20} color="#f97316" />
                                <span className="text-[10px] font-black uppercase tracking-wider text-white/60">Novidade</span>
                            </div>
                            <h3 className="text-xl font-black text-white mb-1.5">Radar iUser</h3>
                            <p className="text-sm text-white/70 mb-4">
                                Veja quem e o que tem perto de você agora — lojas, pessoas e ofertas em tempo real.
                            </p>
                            <button
                                className="flex items-center gap-1.5 px-5 py-2.5 rounded-full font-bold text-sm text-white"
                                style={{ background: GRADIENT }}
                            >
                                <Navigation size={14} />
                                Abrir radar
                            </button>
                        </div>
                    </div>
                </section>

                {/* ===== PRODUTOS ===== */}
                <section>
                    <SectionHeader icon={ShoppingCart} title="Produtos em destaque" subtitle="Separado pra você, perto de casa" />
                    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
                        {sampleProducts.map((p) => (
                            <div key={p.name} className="w-36 flex-shrink-0">
                                <div
                                    className="w-36 h-36 rounded-2xl mb-2 flex items-center justify-center"
                                    style={{ background: `linear-gradient(135deg, ${p.color}, ${p.color}aa)` }}
                                >
                                    <ShoppingCart size={28} color="#fff" opacity={0.5} />
                                </div>
                                <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{p.name}</p>
                                <p className="text-[10px] opacity-50 truncate mb-1" style={{ color: colors.textPrimary }}>{p.store}</p>
                                <p className="text-sm font-black" style={{ color: colors.accent }}>
                                    R$ {p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ===== PUBLICAÇÕES ===== */}
                <section>
                    <SectionHeader icon={MessageCircle} title="Publicações" subtitle="O que as lojas estão postando" />
                    <div className="grid grid-cols-2 gap-3">
                        {samplePosts.map((post) => (
                            <GlassCard key={post.author} className="overflow-hidden">
                                <div
                                    className="w-full aspect-square flex items-center justify-center"
                                    style={{ background: `linear-gradient(135deg, ${post.color}, ${post.color}88)` }}
                                >
                                    <Sparkles size={26} color="#fff" opacity={0.55} />
                                </div>
                                <div className="p-3">
                                    <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>{post.author}</p>
                                    <div className="flex items-center gap-1 mt-1 opacity-60">
                                        <Heart size={11} style={{ color: colors.textPrimary }} />
                                        <span className="text-[10px] font-semibold" style={{ color: colors.textPrimary }}>{post.likes} curtidas</span>
                                    </div>
                                </div>
                            </GlassCard>
                        ))}
                    </div>
                </section>

                {/* ===== PESSOAS ===== */}
                <section>
                    <SectionHeader icon={Users} title="Pessoas" subtitle="Gente nova na sua região" />
                    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollbarWidth: 'none' }}>
                        {samplePeople.map((person) => (
                            <div key={person.name} className="w-24 flex-shrink-0 flex flex-col items-center gap-2">
                                <div className="relative">
                                    <div
                                        className="w-20 h-20 rounded-full flex items-center justify-center font-black text-white text-xl"
                                        style={{ background: `linear-gradient(135deg, ${person.color}, ${person.color}99)` }}
                                    >
                                        {person.name.charAt(0)}
                                    </div>
                                    <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full border-2" style={{ background: '#22c55e', borderColor: colors.background }} />
                                </div>
                                <div className="text-center">
                                    <p className="text-[11px] font-bold truncate w-24" style={{ color: colors.textPrimary }}>{person.name}</p>
                                    <p className="text-[9px] opacity-50 truncate w-24" style={{ color: colors.textPrimary }}>{person.role}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* ===== CANAL DO MOTORISTA ===== */}
                <section>
                    <SectionHeader icon={Car} title="Canal do Motorista" subtitle="Corridas em aberto pra você aceitar" />
                    <GlassCard className="p-5">
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#22c55e' }} />
                                <span className="text-xs font-black" style={{ color: colors.textPrimary }}>Modo motorista ativo</span>
                            </div>
                            <span
                                className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full text-white"
                                style={{ background: GRADIENT }}
                            >
                                2 corridas
                            </span>
                        </div>

                        <div className="flex flex-col gap-2.5">
                            {sampleOpenRides.map((ride) => (
                                <div
                                    key={ride.from}
                                    className="flex items-center justify-between gap-3 p-3 rounded-2xl"
                                    style={{ background: `${colors.textPrimary}08`, border: `1px solid ${colors.border}` }}
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold truncate" style={{ color: colors.textPrimary }}>
                                            {ride.from} → {ride.to}
                                        </p>
                                        <div className="flex items-center gap-1 mt-0.5 opacity-50">
                                            <Clock size={10} style={{ color: colors.textPrimary }} />
                                            <span className="text-[10px]" style={{ color: colors.textPrimary }}>chegada em {ride.eta}</span>
                                        </div>
                                    </div>
                                    <span className="text-sm font-black flex-shrink-0" style={{ color: colors.accent }}>
                                        R$ {ride.price}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </GlassCard>
                </section>

                {/* ===== PLANOS ===== */}
                <section>
                    <SectionHeader icon={Crown} title="Planos" subtitle="Cresça mais rápido no iUser" />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {plans.map((plan) => (
                            <div
                                key={plan.name}
                                className="relative rounded-3xl p-5 flex flex-col"
                                style={{
                                    background: plan.highlight ? GRADIENT : (colors.name === 'claro' ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.05)'),
                                    border: plan.highlight ? 'none' : `1px solid ${colors.border}`,
                                    backdropFilter: 'blur(16px)',
                                    boxShadow: plan.highlight ? '0 10px 30px #f9731650' : colors.shadow,
                                }}
                            >
                                {plan.highlight && (
                                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full text-white flex items-center gap-1" style={{ background: '#111827' }}>
                                        <Zap size={10} /> Mais popular
                                    </span>
                                )}
                                <p className="text-sm font-black mb-1" style={{ color: plan.highlight ? '#fff' : colors.textPrimary }}>{plan.name}</p>
                                <div className="flex items-end gap-1 mb-4">
                                    <span className="text-2xl font-black" style={{ color: plan.highlight ? '#fff' : colors.textPrimary }}>{plan.price}</span>
                                    <span className="text-xs opacity-60 mb-0.5" style={{ color: plan.highlight ? '#fff' : colors.textPrimary }}>{plan.period}</span>
                                </div>
                                <div className="flex flex-col gap-2 flex-1">
                                    {plan.features.map((f) => (
                                        <div key={f} className="flex items-start gap-1.5">
                                            <Check size={13} className="mt-0.5 flex-shrink-0" style={{ color: plan.highlight ? '#fff' : '#22c55e' }} />
                                            <span className="text-[11px] leading-tight" style={{ color: plan.highlight ? 'rgba(255,255,255,0.9)' : colors.textPrimary }}>{f}</span>
                                        </div>
                                    ))}
                                </div>
                                <button
                                    className="mt-4 w-full py-2.5 rounded-full text-xs font-black"
                                    style={{
                                        background: plan.highlight ? '#fff' : `${colors.textPrimary}0d`,
                                        color: plan.highlight ? '#dc2626' : colors.textPrimary,
                                        border: plan.highlight ? 'none' : `1px solid ${colors.border}`,
                                    }}
                                >
                                    Assinar
                                </button>
                            </div>
                        ))}
                    </div>
                </section>

                <p className="text-center text-[10px] opacity-40 pt-2" style={{ color: colors.textPrimary }}>
                    Modelo visual — /modelodehomepage · conteúdo fictício, sem dados reais
                </p>
            </div>
        </div>
    )
}
