'use client'

// src/components/StoreDashboard/painel/PainelLoja.tsx — o PAINEL DA LOJA da 3.0 (/painel-loja/<slug>) no desenho aprovado no laboratório
// /painel-teste: o painel deixa de ser uma lista de relatórios e vira o COMANDO DO DIA, nesta ordem:
//   Sua loja → Precisa de você agora → Pedidos → Como está o dia → Missões → Próximos compromissos → Dinheiro → Digital → Seu plano →
//   O que dizem → Visitantes → Gerenciar a loja → Venda no balcão.
// Tudo com dados REAIS: os blocos que já existiam (pedidos, missões, agenda, caixa das entregas, digital, avaliações, visitantes, venda
// presencial) são os MESMOS componentes de antes, só reordenados; os novos (Sua loja, Precisa de você agora, Como está o dia com o gráfico,
// Seu plano e Gerenciar) leem o banco aqui. A 2.0 continua com o painel antigo (view="all").
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
    AlertCircle, Banknote, Heart, MessageCircle, Wallet, CalendarDays, ChevronRight, ClipboardList, CreditCard, Eye, GraduationCap, Settings, Share2, Star,
    Store, Check,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { isStoreOpenNow, getStoreStatusWithLunch } from '@/lib/storeHours'
import { parseStoreModel } from '@/lib/storeModel'
import { limitText, usePostpaidLimit } from '@/lib/postpaid'
import { fetchStoreDigitalSummary, digitalAttention } from '@/modules/digital'
import { fetchStoreDues } from '@/modules/dues'
import { fetchTipsPanel } from '@/modules/tips'
import StoreFrame from '@/components/store/StoreFrame'
import StoreOrders from '../StoreOrders'
import StoreDeliveryDues from '../StoreDeliveryDues'
import StoreMissions from '../StoreMissions'
import StoreDigital from '../StoreDigital'
import StoreFeedback from '../StoreFeedback'
import StoreVisitors from '../StoreVisitors'
import AtalhoCompromissosDaLoja from '@/app/(main)/compromissos/AtalhoCompromissosDaLoja'
import { gerenciarItens, SELO } from './gerenciar'
import { TYPE_INFO } from '@/components/planos/PostpaidFees'
import LogoFolha from './LogoFolha'
import BalcaoV3 from './BalcaoV3'
import AgoraNaLoja from './AgoraNaLoja'
import { useStorePresence } from '@/modules/store-presence'
import StoreTips from '@/components/tips/StoreTips'
import ExtratoCompleto, { type ExtratoPeriodo } from './ExtratoCompleto'
import { PaginaPainel, useSecaoUrl } from './Casca'
import SalesChart, { type PaidOrder, type SalesPeriod } from './SalesChart'
import type { ExtractPeriod } from '../StoreSalesExtractDialog'

const ORANGE = '#f97316'
const PAGINAS = ['extrato', 'repasses', 'apoios', 'balcao', 'agora'] as const
type PaginaK = typeof PAGINAS[number]
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Metrics = { daily: { revenue: number; orders: number }; weekly: { revenue: number; orders: number }; monthly: { revenue: number; orders: number } }

export default function PainelLoja({ store, storeSlug, profileSlug, userId, metrics, paidOrders, onOpenExtract, onShare, onOrderCountsChange, onSaleCompleted }: {
    store: any
    storeSlug: string
    profileSlug: string
    userId: string | null
    metrics: Metrics
    paidOrders: PaidOrder[]
    onOpenExtract: (p: ExtractPeriod) => void
    onShare: () => void
    onOrderCountsChange?: (c: any) => void
    onSaleCompleted: () => void
}) {
    const { colors } = useTheme()
    const router = useRouter()
    const card = { background: colors.surface, border: `1px solid ${colors.border}` }
    const slug = store.storeSlug || storeSlug
    const editar = `/editar-loja/${encodeURIComponent(slug)}`
    const limit = usePostpaidLimit()
    // páginas que abrem a partir do painel (?secao=): extrato completo, repasses das entregas e apoios recebidos
    const pagina = useSecaoUrl(PAGINAS)
    const [extratoIni, setExtratoIni] = useState<ExtratoPeriodo>('hoje')
    const [logoOpen, setLogoOpen] = useState(false)
    // "Online agora": presença anônima de quem está na loja (tempo real)
    const presenca = useStorePresence(store.id)
    const online = presenca.rows === null ? null : presenca.rows.length
    const [logo, setLogo] = useState<string | null>(store.logo_url || null)

    // ---------- dados novos (cada um some sozinho se falhar) ----------
    const [pub, setPub] = useState<{ level: number; model: string } | null>(null)
    const [att, setAtt] = useState<{ orders: number; services: number; digital: number; dues: number; duesAmount: number; tips: number; chats: number } | null>(null)
    const [plan, setPlan] = useState<{ postpaid: boolean; debt: number; byType: [string, { n: number; total: number }][] } | null>(null)
    const [period, setPeriod] = useState<SalesPeriod>('hoje')

    const loadAttention = useCallback(async () => {
        const [o, s, d, du, tp, ch] = await Promise.all([
            supabase.from('orders').select('id', { count: 'exact', head: true }).eq('store_id', store.id).eq('status', 'pending'),
            supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('store_id', store.id).eq('status', 'pending'),
            fetchStoreDigitalSummary(store.id),
            fetchStoreDues(store.id).catch(() => null),
            fetchTipsPanel(store.id).catch(() => null),
            supabase.rpc('get_my_conversations', { p_scope: 'store', p_store: store.id }),
        ])
        // repasses que o entregador já DECLAROU e esperam a loja conferir (ou contestados)
        const conferir = (du?.items || []).filter((x) => x.status === 'declared' || x.status === 'disputed')
        setAtt({
            orders: o.count || 0, services: s.count || 0, digital: d ? digitalAttention(d) : 0,
            dues: conferir.length, duesAmount: conferir.reduce((t, x) => t + (x.kind === 'machine' ? 0 : Number(x.amount) || 0), 0),
            tips: tp?.toCheck || 0,
            chats: ((ch.data as { unread: number }[] | null) || []).filter((r) => r.unread > 0).length,
        })
    }, [store.id])

    useEffect(() => {
        supabase.from('stores').select('store_level, store_model').eq('id', store.id).maybeSingle()
            .then(({ data }) => setPub({ level: Number((data as any)?.store_level) || 0, model: (data as any)?.store_model || 'mixed' }))
        loadAttention()
        const id = setInterval(() => { if (document.visibilityState === 'visible') loadAttention() }, 30000)
        return () => clearInterval(id)
    }, [store.id, loadAttention])

    useEffect(() => {
        if (!userId) return
        Promise.all([
            supabase.rpc('is_postpaid_user', { p_user_id: userId }),
            supabase.from('driver_postpaid_charges').select('amount, type').eq('driver_id', userId),
        ]).then(([p, c]) => {
            const rows = (c.data || []) as { amount: number; type: string }[]
            const by = new Map<string, { n: number; total: number }>()
            rows.filter((r) => r.type !== 'payment').forEach((r) => { const x = by.get(r.type) || { n: 0, total: 0 }; by.set(r.type, { n: x.n + 1, total: x.total + Number(r.amount || 0) }) })
            setPlan({ postpaid: !!p.data, debt: rows.reduce((t, r) => t + Number(r.amount || 0), 0), byType: [...by.entries()].sort((a, b) => b[1].total - a[1].total) })
        })
            .catch(() => setPlan(null))
    }, [userId])

    const model = parseStoreModel(pub?.model)
    const hasServices = model === 'services' || model === 'mixed' || !!store.allow_scheduling
    const open = isStoreOpenNow(store.business_hours)
    const status = getStoreStatusWithLunch(store.business_hours)

    // ---------- Precisa de você agora (só o que depende da loja; cada linha leva ao lugar que resolve) ----------
    const atencao = useMemo(() => {
        const a: { cor: string; icone: ReactNode; titulo: string; sub: string; ir: string; rotulo: string }[] = []
        if (att?.orders) a.push({ cor: '#22c55e', icone: <ClipboardList size={17} />, titulo: `${att.orders} ${att.orders === 1 ? 'pedido novo' : 'pedidos novos'}`, sub: 'Aceite para a loja começar a preparar', ir: `/painel-loja/${slug}/pedidos`, rotulo: 'Ver pedidos' })
        if (att?.services) a.push({ cor: '#14b8a6', icone: <CalendarDays size={17} />, titulo: `${att.services} ${att.services === 1 ? 'pedido de serviço' : 'pedidos de serviço'}`, sub: 'Clientes esperando o horário ser confirmado', ir: `/painel-loja/${slug}/pedidos`, rotulo: 'Ver pendentes' })
        if (att?.digital) a.push({ cor: '#a855f7', icone: <GraduationCap size={17} />, titulo: `${att.digital} ${att.digital === 1 ? 'pagamento digital' : 'pagamentos digitais'} para conferir`, sub: 'Confira o Pix e libere o acesso', ir: `/painel-loja/${slug}/pedidos`, rotulo: 'Conferir' })
        if (att?.dues) a.push({ cor: '#eab308', icone: <Banknote size={17} />, titulo: `${att.dues} ${att.dues === 1 ? 'repasse' : 'repasses'} para conferir`, sub: att.duesAmount > 0 ? `${brl(att.duesAmount)} que os entregadores dizem ter repassado` : 'Confira se recebeu e confirme', ir: '?secao=repasses', rotulo: 'Conferir' })
        if (att?.tips) a.push({ cor: '#8b5cf6', icone: <Heart size={17} />, titulo: `${att.tips} ${att.tips === 1 ? 'apoio' : 'apoios'} para conferir`, sub: 'Fãs dizem que mandaram um Pix: confira na sua conta', ir: '?secao=apoios', rotulo: 'Conferir' })
        if (att?.chats) a.push({ cor: '#16a34a', icone: <MessageCircle size={17} />, titulo: `${att.chats} ${att.chats === 1 ? 'conversa' : 'conversas'} sem resposta`, sub: 'Clientes falando com a loja', ir: `/atividade?aba=conversas&sala=${encodeURIComponent(slug)}`, rotulo: 'Responder' })
        if (!store.pix_key) a.push({ cor: '#ef4444', icone: <CreditCard size={17} />, titulo: 'Cadastre sua chave Pix', sub: 'Sem ela a loja não recebe entrada, apoio nem repasse', ir: `${editar}?secao=pagamento`, rotulo: 'Cadastrar' })
        if (plan?.postpaid && plan.debt >= limit) a.push({ cor: '#ef4444', icone: <AlertCircle size={17} />, titulo: 'O Pós-pago chegou ao limite', sub: `Quite ${brl(plan.debt)} para continuar vendendo`, ir: '/planos/pos-pago', rotulo: 'Quitar' })
        return a
    }, [att, store.pix_key, plan, limit, slug, editar])

    const sec = (titulo: string, direita?: ReactNode) => (
        <div className="mb-2 mt-6 flex items-center gap-2">
            <p className="text-[13px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>{titulo}</p>
            <div className="ml-auto">{direita}</div>
        </div>
    )

    // ---------- Gerenciar a loja: a MESMA lista do Editar loja, cada atalho abre direto a folha/página dele ----------
    const tiles = gerenciarItens(store, hasServices, { agendaNoPainel: true })

    const periodos: { k: SalesPeriod; l: string; m: { revenue: number; orders: number }; ex: ExtractPeriod }[] = [
        { k: 'hoje', l: 'Hoje', m: metrics.daily, ex: 'daily' },
        { k: 'semana', l: 'Semana', m: metrics.weekly, ex: 'weekly' },
        { k: 'mes', l: new Date().toLocaleDateString('pt-BR', { month: 'long' }).replace(/^./, (c) => c.toUpperCase()), m: metrics.monthly, ex: 'monthly' },
    ]
    const atual = periodos.find((p) => p.k === period)!

    return (
        <div>
            {/* ===== SUA LOJA ===== */}
            {sec('Sua loja')}
            <div className="rounded-[28px] p-3.5" style={card}>
                <div className="flex items-center gap-3">
                    <button onClick={() => setLogoOpen(true)} aria-label="Logo e moldura" className="flex-shrink-0 active:scale-95 transition">
                        <StoreFrame level={pub?.level || 0} size={48} innerRadius={14}>
                            <span className="w-12 h-12 rounded-[14px] overflow-hidden flex items-center justify-center" style={{ background: `${colors.border}55` }}>
                                {logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : <Store size={22} style={{ color: ORANGE }} />}
                            </span>
                        </StoreFrame>
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className="text-[17px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{store.name}</p>
                        <p className="text-[11.5px] font-semibold truncate" style={{ color: open ? '#16a34a' : colors.textSecondary }}>{status?.text || (open ? 'Aberta agora' : 'Fechada')}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                            {plan && (
                                <button onClick={() => router.push(plan.postpaid ? '/planos/pos-pago' : '/planos')} className="inline-flex items-center gap-1 text-[10.5px] font-black px-2 h-5 rounded-full active:opacity-70"
                                    style={{ background: plan.postpaid ? `${ORANGE}22` : '#16a34a22', color: plan.postpaid ? '#c2410c' : '#15803d' }}>
                                    {plan.postpaid ? `Pós-pago · ${brl(plan.debt)} de ${limitText(limit)}` : 'Pré-pago'}
                                </button>
                            )}
                            {Number(store.ratings_count) > 0 && (
                                <span className="text-[11.5px] font-black inline-flex items-center gap-1" style={{ color: '#a16207' }}>
                                    <Star size={12} fill="#eab308" style={{ color: '#eab308' }} />{Number(store.ratings_avg || 0).toFixed(1).replace('.', ',')} · {store.ratings_count} avaliações
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                    {[['Ver loja', <Eye key="a" size={14} />, () => router.push(`/${slug}`)], ['Compartilhar', <Share2 key="b" size={14} />, onShare], ['Editar', <Settings key="c" size={14} />, () => router.push(editar)]].map(([t, ic, fn], i) => (
                        <button key={String(t)} onClick={fn as () => void} className="h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition"
                            style={i === 2 ? { background: ORANGE, color: '#fff' } : { background: `${colors.border}50`, color: colors.textPrimary }}>{ic as ReactNode}{t as string}</button>
                    ))}
                </div>
            </div>

            {/* ===== PRECISA DE VOCÊ AGORA ===== */}
            {sec('Precisa de você agora', atencao.length > 0 ? <span className="text-[11px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: '#22c55e' }}>{atencao.length}</span> : undefined)}
            {att === null ? (
                <div className="rounded-3xl h-16 animate-pulse" style={{ background: `${colors.border}40` }} />
            ) : atencao.length === 0 ? (
                <div className="rounded-3xl p-4 flex items-center gap-3" style={{ ...card, borderColor: '#22c55e66' }}>
                    <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#22c55e22', color: '#22c55e' }}><Check size={18} /></span>
                    <div><p className="text-[14px] font-black" style={{ color: colors.textPrimary }}>Tudo em dia</p><p className="text-[12px]" style={{ color: colors.textSecondary }}>Nada esperando por você agora.</p></div>
                </div>
            ) : (
                <div className="rounded-3xl overflow-hidden" style={card}>
                    {atencao.map((a, i) => (
                        <button key={a.titulo} onClick={() => (a.ir.startsWith('?secao=') ? pagina.abrir(a.ir.slice(7) as PaginaK) : router.push(a.ir))} className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:opacity-70 transition" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                            <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${a.cor}22`, color: a.cor }}>{a.icone}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[14px] font-black leading-tight" style={{ color: colors.textPrimary }}>{a.titulo}</span>
                                <span className="block text-[11.5px] leading-snug" style={{ color: colors.textSecondary }}>{a.sub}</span>
                            </span>
                            <span className="text-[11.5px] font-black flex items-center gap-0.5 flex-shrink-0" style={{ color: a.cor }}>{a.rotulo}<ChevronRight size={14} /></span>
                        </button>
                    ))}
                </div>
            )}

            {/* ===== PEDIDOS (o funil de sempre: Novos → Em preparo → Prontos → A caminho, com as ações) ===== */}
            <div className="mt-6">
                <StoreOrders storeId={store.id} storeName={store.name} onOrderCountsChange={(c: any) => { onOrderCountsChange?.(c); loadAttention() }} storeSlug={slug} />
            </div>

            {/* ===== COMO ESTÁ O DIA (vendas pagas de verdade; o extrato completo abre no mesmo diálogo de sempre) ===== */}
            {sec('Como está o dia')}
            <div className="rounded-3xl p-3" style={card}>
                <div className="flex gap-1.5 mb-2.5">
                    {periodos.map((p) => (
                        <button key={p.k} onClick={() => setPeriod(p.k)} className="h-8 px-3.5 rounded-full text-[12px] font-black active:scale-95" style={period === p.k ? { background: ORANGE, color: '#fff' } : { border: `1px solid ${colors.border}`, color: colors.textPrimary }}>{p.l}</button>
                    ))}
                </div>
                <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[24px] font-black leading-none" style={{ color: colors.textPrimary }}>{brl(atual.m.revenue)}</p>
                        <p className="text-[11.5px] mt-1" style={{ color: colors.textSecondary }}>{atual.m.orders} {atual.m.orders === 1 ? 'venda' : 'vendas'}</p>
                        <button onClick={() => pagina.abrir('agora')} className="mt-2.5 h-8 pl-2 pr-3 rounded-full text-[12px] font-black flex items-center gap-1.5 active:scale-95" style={{ background: '#16a34a1c', color: '#15803d' }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: '#22c55e', boxShadow: '0 0 0 3px #22c55e33' }} />{online === null ? '…' : online} online agora<ChevronRight size={13} />
                        </button>
                    </div>
                    <SalesChart orders={paidOrders} period={period} />
                </div>
                <button onClick={() => { setExtratoIni(period === 'mes' ? 'mes' : period); pagina.abrir('extrato') }} className="w-full mt-3 h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                    Abrir o extrato<ChevronRight size={14} />
                </button>
            </div>

            {/* ===== MISSÕES ===== */}
            <div className="mt-6"><StoreMissions storeId={store.id} storeSlug={slug} /></div>

            {/* ===== PRÓXIMOS COMPROMISSOS (só loja que atende com hora marcada) ===== */}
            {hasServices && <div className="mt-2"><AtalhoCompromissosDaLoja profileSlug={profileSlug} storeId={store.id} storeSlug={slug} /></div>}

            {/* ===== DINHEIRO: repasses das entregas, extrato e apoios — cada linha abre a página dela ===== */}
            {sec('Dinheiro')}
            <div className="rounded-3xl overflow-hidden" style={card}>
                {([
                    { k: 'repasses' as PaginaK, ic: <Banknote size={17} />, cor: '#eab308', t: 'Repasses das entregas', sub: att?.dues ? `${att.dues} para conferir${att.duesAmount ? ` · ${brl(att.duesAmount)}` : ''}` : 'dinheiro da porta, maquininha e contestações', alerta: !!att?.dues },
                    { k: 'extrato' as PaginaK, ic: <Wallet size={17} />, cor: '#22c55e', t: 'Extrato completo', sub: `${brl(metrics.monthly.revenue)} recebidos neste mês`, alerta: false },
                    { k: 'apoios' as PaginaK, ic: <Heart size={17} />, cor: '#8b5cf6', t: 'Apoios recebidos', sub: att?.tips ? `${att.tips} para conferir` : 'gorjetas dos fãs, por Pix', alerta: !!att?.tips },
                ]).map((r, i) => (
                    <button key={r.k} onClick={() => { if (r.k === 'extrato') setExtratoIni('mes'); pagina.abrir(r.k) }} className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:opacity-70" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined }}>
                        <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${r.cor}22`, color: r.cor }}>{r.ic}</span>
                        <span className="min-w-0 flex-1"><span className="block text-[14px] font-black leading-tight" style={{ color: colors.textPrimary }}>{r.t}</span><span className="block text-[11.5px] leading-snug" style={{ color: r.alerta ? '#b45309' : colors.textSecondary }}>{r.sub}</span></span>
                        {r.alerta && <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: '#eab308' }} />}
                        <ChevronRight size={16} style={{ color: colors.textSecondary }} />
                    </button>
                ))}
            </div>

            {/* ===== DIGITAL E CLUBE ===== */}
            <div className="mt-2"><StoreDigital storeId={store.id} storeSlug={slug} hasPix={!!store.pix_key} v3 /></div>

            {/* ===== SEU PLANO ===== */}
            {plan && (
                <>
                    {sec('Seu plano')}
                    <button onClick={() => router.push(plan.postpaid ? '/planos/pos-pago' : '/planos')} className="w-full text-left rounded-3xl p-3.5 active:scale-[.99] transition" style={card}>
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 h-6 rounded-full text-[11px] font-black text-white flex items-center" style={{ background: plan.postpaid ? ORANGE : '#16a34a' }}>{plan.postpaid ? 'Pós-pago' : 'Pré-pago'}</span>
                            <span className="text-[11.5px] font-semibold" style={{ color: colors.textSecondary }}>{plan.postpaid ? 'você paga só pelo que usa' : 'mensalidade, sem taxa por venda'}</span>
                            <ChevronRight size={15} className="ml-auto" style={{ color: colors.textSecondary }} />
                        </div>
                        {plan.postpaid && (<>
                            <div className="flex items-baseline justify-between mt-3"><p className="text-[22px] font-black leading-none" style={{ color: colors.textPrimary }}>{brl(plan.debt)}</p><p className="text-[11.5px] font-bold" style={{ color: colors.textSecondary }}>de {limitText(limit)} · limite</p></div>
                            <span className="block h-2.5 rounded-full overflow-hidden mt-2" style={{ background: `${colors.border}70` }}><span className="block h-full rounded-full" style={{ width: `${Math.min(100, (plan.debt / limit) * 100)}%`, background: plan.debt >= limit ? '#ef4444' : 'linear-gradient(90deg,#f97316,#dc2626)' }} /></span>
                            {plan.byType.length > 0 && (
                                <div className="mt-3 flex flex-col gap-1">
                                    <p className="text-[10.5px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>O que foi cobrado</p>
                                    {plan.byType.slice(0, 4).map(([t, v]) => (
                                        <div key={t} className="flex items-center justify-between text-[12px]">
                                            <span style={{ color: colors.textPrimary }}>{v.n} × {(TYPE_INFO as any)[t]?.label?.toLowerCase() || t}</span>
                                            <span className="font-black" style={{ color: colors.textPrimary }}>{brl(v.total)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p className="text-[11.5px] font-black mt-2.5" style={{ color: ORANGE }}>Ver tudo e quitar agora →</p>
                        </>)}
                        {!plan.postpaid && <p className="text-[12px] mt-2.5 leading-snug" style={{ color: colors.textSecondary }}>Mensalidade de R$ 100 · nenhuma taxa por venda, pedido ou agendamento.</p>}
                    </button>
                </>
            )}

            {/* ===== O QUE DIZEM DA LOJA ===== */}
            <div className="mt-6"><StoreFeedback storeId={store.id} /></div>

            {/* ===== VISITANTES ===== */}
            <div className="mt-2"><StoreVisitors storeId={store.id} /></div>

            {/* ===== GERENCIAR A LOJA (tudo que é configuração mora em Editar loja) ===== */}
            {sec('Gerenciar a loja')}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 text-[11px] font-bold" style={{ color: colors.textSecondary }}>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: SELO.on }} />Ligado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: SELO.off }} />Desligado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: SELO.warn }} />Precisa de atenção</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
                {tiles.map((g) => {
                    const apagado = g.est === 'off'
                    return (
                        <button key={g.k} onClick={() => router.push(g.k === 'agenda' ? `/compromissos/${encodeURIComponent(slug)}` : `${editar}?secao=${g.k}`)} className="relative rounded-3xl p-3 text-left active:scale-95 transition" style={{ background: apagado ? colors.surface : `${g.cor}14`, border: `1.5px solid ${apagado ? colors.border : `${g.cor}55`}`, opacity: apagado ? 0.75 : 1 }}>
                            <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full" style={{ background: SELO[g.est] }} />
                            <span className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background: apagado ? `${colors.border}60` : `${g.cor}26`, color: apagado ? colors.textSecondary : g.cor }}>{g.ic}</span>
                            <span className="block text-[12.5px] font-black leading-tight mt-2" style={{ color: colors.textPrimary }}>{g.t}</span>
                            <span className="block text-[10.5px] leading-tight mt-0.5" style={{ color: g.est === 'warn' ? '#dc2626' : colors.textSecondary }}>{g.texto}</span>
                        </button>
                    )
                })}
            </div>

            {logoOpen && <LogoFolha storeId={store.id} storeName={store.name} logoUrl={logo} level={pub?.level || 0} onClose={() => setLogoOpen(false)} onSaved={(u) => { setLogo(u); setLogoOpen(false) }} />}
            {pagina.secao === 'extrato' && <ExtratoCompleto storeId={store.id} storeName={store.name} inicial={extratoIni} onClose={pagina.fechar} />}
            {pagina.secao === 'repasses' && (
                <PaginaPainel titulo="Repasses das entregas" sub={store.name} cor="#eab308" icone={<Banknote size={18} />} onClose={pagina.fechar}>
                    <p className="text-[12.5px] leading-snug mb-3" style={{ color: colors.textSecondary }}>O dinheiro recebido na porta é do pedido: o entregador fica com o frete e repassa o resto à loja. Pedido no cartão usa a <b>sua</b> maquininha — o dinheiro cai direto na sua conta; aqui você confere a devolução dela. Entrega contestada pelo cliente também aparece aqui.</p>
                    <StoreDeliveryDues storeId={store.id} v3 />
                    {!att?.dues && <div className="rounded-3xl p-4 mt-3 flex items-center gap-3" style={{ ...card, borderColor: '#22c55e66' }}><span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#22c55e22', color: '#22c55e' }}><Check size={18} /></span><p className="text-[13px] font-black">Nada para conferir agora</p></div>}
                </PaginaPainel>
            )}
            {pagina.secao === 'apoios' && (
                <PaginaPainel titulo="Apoios recebidos" sub={store.name} cor="#8b5cf6" icone={<Heart size={18} />} onClose={pagina.fechar}>
                    <StoreTips storeId={store.id} hasPix={!!store.pix_key} v3 />
                </PaginaPainel>
            )}

            {/* ===== VENDA NO BALCÃO: botão FIXO acima da barra (o fluxo novo: itens → revisar → cobrar → recibo) ===== */}
            <div className="h-16" />
            <button onClick={() => pagina.abrir('balcao')} className="fixed right-4 z-30 h-12 px-5 rounded-full text-[14px] font-black text-white flex items-center gap-2 active:scale-95 transition"
                style={{ bottom: 'calc(var(--shell-bottom, 0px) + 14px)', background: ORANGE, boxShadow: '0 8px 22px #f9731655' }}>
                <Store size={17} />Venda no balcão
            </button>
            {pagina.secao === 'agora' && <AgoraNaLoja storeName={store.name} presenca={presenca} onClose={pagina.fechar} />}
            {pagina.secao === 'balcao' && <BalcaoV3 storeId={store.id} storeName={store.name} pixKey={store.pix_key || null} pixKeyType={store.pix_key_type || null} onClose={pagina.fechar} onDone={onSaleCompleted} />}
        </div>
    )
}
