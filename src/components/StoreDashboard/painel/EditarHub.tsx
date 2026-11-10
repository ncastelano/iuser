'use client'

// src/components/StoreDashboard/painel/EditarHub.tsx — "Editar loja" da 3.0 (/editar-loja/<slug>) no desenho do laboratório /painel-teste:
// a CENTRAL de tudo que se configura, agrupada pelo que a pessoa quer fazer (Sobre a loja · O que você vende · Como você recebe · Quando e quem
// atende · Divulgação), com o ESTADO real de cada coisa na linha. Tocar abre o destino:
//   · FOLHA (sobe de baixo) para interruptor + poucas decisões: dados, entrega, pagamento, horários, regras da agenda, clube, WhatsApp;
//   · PÁGINA para listas editadas item a item: catálogo (abas Produtos · Digitais · Serviços, com as Promoções no alto de Produtos), equipe,
//     publicações; a agenda abre a página de compromissos da loja.
// O destino vai no endereço (`?secao=<k>`): o voltar do navegador fecha e o link do painel ("Gerenciar a loja") abre direto nele.
// Os blocos DENTRO das folhas/páginas são os MESMOS componentes de antes (mesma lógica e mesmo banco); só a moldura é nova.
// No fim: Pausar a loja (`stores.is_active`) e Excluir a loja.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, ChevronRight, Crown, Eye, EyeOff, Share2, Store, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { useTheme } from '@/app/contexts/theme'
import { lockBodyScroll } from '@/lib/bodyScrollLock'
import { cachedStoreLevels, levelOf, loadStoreLevels } from '@/modules/store-levels'
import StoreFrame from '@/components/store/StoreFrame'
import { V3SectionForceOpen } from '../V3Section'
import CatalogoV3, { type CatAba } from './CatalogoV3'
import { gerenciarItens, SELO, TIPO_SECAO, type ItemGerenciar, type SecaoKey } from './gerenciar'

const ORANGE = '#f97316'

const GRUPOS: { titulo: string; dica: string; ks: SecaoKey[] }[] = [
    { titulo: 'Sobre a loja', dica: 'Como a loja aparece para o cliente', ks: ['dados'] },
    { titulo: 'O que você vende', dica: 'Produtos, digitais, serviços e promoções', ks: ['catalogo', 'promocoes'] },
    { titulo: 'Como você recebe', dica: 'Pagamento e entrega', ks: ['pagamento', 'entrega'] },
    { titulo: 'Quando e quem atende', dica: 'Horários, agenda e equipe', ks: ['horarios', 'agenda', 'regras', 'equipe'] },
    { titulo: 'Divulgação', dica: 'Publicações, clube e avisos', ks: ['publicacoes', 'clube', 'whatsapp'] },
]


export interface EditarBlocos {
    dados: ReactNode
    entrega: ReactNode
    pagamento: ReactNode
    horarios: ReactNode
    regras: ReactNode
    clube: ReactNode
    whatsapp?: ReactNode
    equipe: ReactNode
    publicacoes: ReactNode
    promocoes: ReactNode
}

function lerSecao(): { k: SecaoKey | null; aba: CatAba | null } {
    if (typeof window === 'undefined') return { k: null, aba: null }
    const q = new URLSearchParams(window.location.search)
    const k = q.get('secao') as SecaoKey | null
    const aba = q.get('aba') as CatAba | null
    return { k: k && k in TIPO_SECAO ? k : null, aba: aba && ['produtos', 'digitais', 'servicos'].includes(aba) ? aba : null }
}

export default function EditarHub({ store, storeSlug, hasServices, whatsapp, blocos, onShare, onDelete, onStoreChange }: {
    store: any
    storeSlug: string
    hasServices: boolean
    whatsapp: boolean
    blocos: EditarBlocos
    onShare: () => void
    onDelete: () => void
    onStoreChange: (patch: Record<string, unknown>) => void
}) {
    const { colors } = useTheme()
    const router = useRouter()
    const slug = store.storeSlug || storeSlug
    const card = { background: colors.surface, border: `1px solid ${colors.border}` }
    const [{ k: secao, aba }, setSecao] = useState<{ k: SecaoKey | null; aba: CatAba | null }>({ k: null, aba: null })
    const [levels, setLevels] = useState(cachedStoreLevels())
    const [pausando, setPausando] = useState(false)
    const pushed = useRef(false)
    const [level, setLevel] = useState(Number(store.store_level) || 0)
    const [catOrder, setCatOrder] = useState<string[] | null>(null)

    // o destino mora no endereço: abrir = pushState, o voltar do navegador fecha
    useEffect(() => {
        setSecao(lerSecao())
        const onPop = () => { pushed.current = false; setSecao(lerSecao()) }
        window.addEventListener('popstate', onPop)
        loadStoreLevels().then(setLevels).catch(() => {})
        // o nível não está na visão do dono (my_stores foi criada antes da coluna): vem da coluna pública
        supabase.from('stores').select('store_level, category_order').eq('id', store.id).maybeSingle().then(({ data }) => { setLevel(Number((data as any)?.store_level) || 0); setCatOrder((data as any)?.category_order || null) })
        return () => window.removeEventListener('popstate', onPop)
    }, [store.id])

    const abrir = useCallback((k: SecaoKey, a?: CatAba) => {
        if (k === 'agenda') { router.push(`/compromissos/${encodeURIComponent(slug)}`); return }
        const q = new URLSearchParams(window.location.search)
        q.set('secao', k)
        if (a) q.set('aba', a); else q.delete('aba')
        if (pushed.current) window.history.replaceState(window.history.state, '', `${window.location.pathname}?${q}`)
        else { window.history.pushState(window.history.state, '', `${window.location.pathname}?${q}`); pushed.current = true }
        setSecao({ k, aba: a ?? null })
    }, [router, slug])

    const fechar = useCallback(() => {
        // abriu daqui (pushState): o voltar do navegador fecha; abriu direto pelo link do painel: só tira o parâmetro, sem sair da página
        if (pushed.current) { pushed.current = false; window.history.back(); return }
        const q = new URLSearchParams(window.location.search)
        q.delete('secao'); q.delete('aba')
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${q.toString() ? `?${q}` : ''}`)
        setSecao({ k: null, aba: null })
    }, [])

    const trocarAba = (a: CatAba) => {
        const q = new URLSearchParams(window.location.search)
        q.set('aba', a)
        window.history.replaceState(window.history.state, '', `${window.location.pathname}?${q}`)
        setSecao((s) => ({ ...s, aba: a }))
    }

    const itens = useMemo(() => gerenciarItens(store, hasServices, { whatsapp }), [store, hasServices, whatsapp])
    const faltam = itens.filter((i) => i.est === 'warn')
    const nivel = levelOf(levels, level)
    const pausada = store.is_active === false

    const pausar = async (v: boolean) => {
        if (pausando) return
        setPausando(true)
        const { error } = await supabase.from('stores').update({ is_active: !v }).eq('id', store.id)
        setPausando(false)
        if (error) { toast.error('Não deu para mudar agora', { description: error.message }); return }
        onStoreChange({ is_active: !v })
        toast.success(v ? 'Loja pausada' : 'Loja voltou ao ar', { description: v ? 'Ela some das listas e não recebe pedidos. Nada foi apagado.' : 'Ela aparece de novo para os clientes.' })
    }

    const item = (k: SecaoKey) => itens.find((i) => i.k === k)

    return (
        <div className="pb-6">
            {/* ===== identidade da loja ===== */}
            <div className="rounded-[28px] p-3.5" style={card}>
                <div className="flex items-center gap-3">
                    <button onClick={() => abrir('dados')} aria-label="Trocar o logo" className="flex-shrink-0">
                        <StoreFrame level={level} size={56} innerRadius={16}>
                            <span className="w-14 h-14 rounded-[16px] overflow-hidden flex items-center justify-center" style={{ background: `${colors.border}55` }}>
                                {store.logo_url ? <img src={store.logo_url} alt="" className="w-full h-full object-cover" /> : <Store size={24} style={{ color: ORANGE }} />}
                            </span>
                        </StoreFrame>
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className="text-[16px] font-black leading-tight truncate" style={{ color: colors.textPrimary }}>{store.name}</p>
                        <p className="text-[11.5px] truncate" style={{ color: colors.textSecondary }}>iuser.com.br/{slug}</p>
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-black mt-1 px-2 py-0.5 rounded-full" style={{ background: '#fbbf2433', color: '#92400e' }}>
                            <Crown size={11} />{level > 0 ? `Nível ${level} · ${nivel.name}` : 'Sem moldura ainda'}
                        </span>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                    <button onClick={() => router.push(`/${slug}`)} className="h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}><Eye size={14} />Ver como cliente</button>
                    <button onClick={onShare} className="h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 text-white active:scale-95 transition" style={{ background: ORANGE }}><Share2 size={14} />Compartilhar</button>
                </div>
            </div>

            {pausada && (
                <div className="rounded-2xl p-3 mt-3 text-[12px] font-semibold leading-snug flex items-start gap-2" style={{ background: `${colors.border}40`, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                    <EyeOff size={15} className="flex-shrink-0 mt-0.5" /> <span><b>A loja está pausada.</b> Ela não aparece nas listas e não recebe pedidos. Religue em “Pausar a loja”, lá embaixo.</span>
                </div>
            )}
            {faltam.length > 0 && (
                <div className="rounded-2xl p-3 mt-3 text-[12px] font-semibold leading-snug" style={{ background: '#ef444412', border: '1px solid #ef444455', color: colors.textPrimary }}>
                    <b style={{ color: '#ef4444' }}>{faltam.length} {faltam.length === 1 ? 'coisa precisa' : 'coisas precisam'} de atenção</b> — {faltam.map((f) => f.t.toLowerCase()).join(', ')}.
                </div>
            )}

            {GRUPOS.map((g) => {
                const linhas = g.ks.map(item).filter(Boolean) as ItemGerenciar[]
                if (linhas.length === 0) return null
                return (
                    <div key={g.titulo} className="mt-5">
                        <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>{g.titulo}</p>
                        <p className="text-[11px] mb-1.5" style={{ color: colors.textSecondary }}>{g.dica}</p>
                        <div className="rounded-3xl overflow-hidden" style={card}>
                            {linhas.map((i, n) => (
                                <button key={i.k} onClick={() => abrir(i.k)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:opacity-70" style={{ borderTop: n ? `1px solid ${colors.border}` : undefined }}>
                                    <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: i.est === 'off' ? `${colors.border}70` : `${i.est === 'warn' ? '#ef4444' : i.cor}26`, color: i.est === 'off' ? colors.textSecondary : i.est === 'warn' ? '#ef4444' : i.cor }}>{i.ic}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[13.5px] font-black leading-tight" style={{ color: colors.textPrimary }}>{i.t}</span>
                                        <span className="block text-[11.5px] font-semibold leading-tight mt-0.5" style={{ color: i.est === 'warn' ? '#ef4444' : colors.textSecondary }}>{i.texto}</span>
                                    </span>
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SELO[i.est] }} />
                                    <ChevronRight size={16} style={{ color: colors.textSecondary }} />
                                </button>
                            ))}
                        </div>
                    </div>
                )
            })}

            <div className="mt-5">
                <p className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: colors.textSecondary }}>Mais</p>
                <div className="rounded-3xl overflow-hidden" style={card}>
                    <div className="flex items-center gap-3 px-3.5 py-3">
                        <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}70`, color: colors.textSecondary }}><EyeOff size={19} /></span>
                        <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-black" style={{ color: colors.textPrimary }}>Pausar a loja</span><span className="block text-[11.5px]" style={{ color: colors.textSecondary }}>Some das listas e não recebe pedidos; nada é apagado.</span></span>
                        <Toggle on={pausada} disabled={pausando} onChange={pausar} label="Pausar a loja" />
                    </div>
                    <button onClick={onDelete} className="w-full flex items-center gap-3 px-3.5 py-3 text-left" style={{ borderTop: `1px solid ${colors.border}` }}>
                        <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: '#ef444422', color: '#ef4444' }}><Trash2 size={19} /></span>
                        <span className="flex-1 min-w-0"><span className="block text-[13.5px] font-black" style={{ color: '#ef4444' }}>Excluir a loja</span><span className="block text-[11.5px]" style={{ color: colors.textSecondary }}>Apaga a loja, o catálogo e o histórico. Não tem volta.</span></span>
                    </button>
                </div>
            </div>

            {secao && TIPO_SECAO[secao] === 'folha' && item(secao) && (
                <Folha item={item(secao)!} onClose={fechar}>{blocos[secao as keyof EditarBlocos] as ReactNode}</Folha>
            )}
            {secao && TIPO_SECAO[secao] === 'pagina' && secao !== 'agenda' && item(secao) && (
                <Pagina item={secao === 'promocoes' ? item('catalogo')! : item(secao)!} loja={store.name} onClose={fechar} promo={secao === 'promocoes'}>
                    {secao === 'catalogo' || secao === 'promocoes'
                        ? <CatalogoV3 storeId={store.id} storeSlug={slug} hasServices={hasServices} aba={aba || 'produtos'} onAba={trocarAba} promocoes={blocos.promocoes}
                            categoryOrder={catOrder} onCategoryOrder={setCatOrder} />
                        : secao === 'equipe' && store.iuser_delivery_enabled
                            ? <EquipeDesligada onMudar={() => abrir('entrega')}>{blocos.equipe}</EquipeDesligada>
                            : blocos[secao as keyof EditarBlocos] as ReactNode}
                </Pagina>
            )}
        </div>
    )
}

function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
    const { colors } = useTheme()
    return (
        <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
            className="relative w-12 h-7 rounded-full flex-shrink-0 transition disabled:opacity-50" style={{ background: on ? ORANGE : `${colors.border}` }}>
            <span className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all shadow" style={{ left: on ? 22 : 2 }} />
        </button>
    )
}

/** folha que sobe de baixo, acima da barra do app; o voltar do navegador fecha. Sem transform/blur no contêiner (os diálogos de dentro, como o
 *  LocationPicker, usam position: fixed e ficariam presos nele). */
function Folha({ item, onClose, children }: { item: ItemGerenciar; onClose: () => void; children: ReactNode }) {
    const { colors } = useTheme()
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true); const solta = lockBodyScroll(); const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', esc); return () => { solta(); window.removeEventListener('keydown', esc) } }, [onClose])
    if (!mounted) return null
    return createPortal(
        <div className="fixed inset-x-0 top-0 z-[80] flex items-end justify-center" style={{ bottom: 'var(--staging-banner-h, 0px)' }}>
            <style>{`@keyframes folhaSobe { from { opacity: 0; margin-bottom: -40px } to { opacity: 1; margin-bottom: 0 } } @media (prefers-reduced-motion: reduce) { .folha-editar { animation: none !important } }`}</style>
            <button aria-label="Fechar" onClick={onClose} className="absolute inset-0" style={{ background: 'rgba(0,0,0,.5)' }} />
            <div role="dialog" aria-modal="true" aria-label={item.t} className="folha-editar relative w-full max-w-md max-h-[90dvh] flex flex-col rounded-t-[28px]"
                style={{ background: colors.background, border: `1px solid ${colors.border}`, boxShadow: '0 -20px 50px rgba(0,0,0,.35)', animation: 'folhaSobe .28s ease-out' }}>
                <div className="pt-2.5 flex justify-center"><span className="w-10 h-1.5 rounded-full" style={{ background: colors.border }} /></div>
                <div className="flex items-center gap-2.5 px-4 pt-2 pb-3">
                    <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${item.est === 'warn' ? '#ef4444' : item.cor}26`, color: item.est === 'warn' ? '#ef4444' : item.cor }}>{item.ic}</span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[17px] font-black leading-tight" style={{ color: colors.textPrimary }}>{item.t}</p>
                        <p className="text-[11.5px] font-semibold flex items-center gap-1" style={{ color: item.est === 'warn' ? '#ef4444' : colors.textSecondary }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: SELO[item.est] }} />{item.texto}
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}><X size={16} /></button>
                </div>
                <div className="overflow-y-auto px-4 pb-3 min-h-0">
                    <V3SectionForceOpen.Provider value={true}>{children}</V3SectionForceOpen.Provider>
                </div>
                <div className="px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))]" style={{ borderTop: `1px solid ${colors.border}` }}>
                    <button onClick={onClose} className="w-full h-12 rounded-full text-[14px] font-black text-white active:scale-95 transition" style={{ background: item.cor }}>Pronto</button>
                    <p className="text-[10.5px] text-center mt-1.5" style={{ color: colors.textSecondary }}>Cada parte acima salva no próprio botão dela.</p>
                </div>
            </div>
        </div>,
        document.body,
    )
}

/** página do destino: no lugar do hub, com voltar + título presos no topo (abaixo da navbar da 3.0) */
function Pagina({ item, loja, onClose, promo = false, children }: { item: ItemGerenciar; loja: string; onClose: () => void; promo?: boolean; children: ReactNode }) {
    const { colors } = useTheme()
    useEffect(() => { window.scrollTo({ top: 0 }) }, [item.k])
    useEffect(() => { if (promo) setTimeout(() => document.getElementById('editar-promocoes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 600) }, [promo])
    return createPortal(
        <div className="fixed inset-x-0 z-[60] overflow-y-auto" style={{ top: 'var(--shell-top, 0px)', bottom: 0, background: colors.background }}>
            <div className="max-w-2xl mx-auto">
                <div className="sticky top-0 z-10 flex items-center gap-2.5 px-4 py-2.5" style={{ background: colors.background, borderBottom: `1px solid ${colors.border}` }}>
                    <button onClick={onClose} aria-label="Voltar" className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}><ArrowLeft size={18} /></button>
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${item.cor}26`, color: item.cor }}>{item.ic}</span>
                    <div className="min-w-0"><p className="text-[16px] font-black leading-tight" style={{ color: colors.textPrimary }}>{item.t}</p><p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{loja}</p></div>
                </div>
                <div className="px-4 pt-4" style={{ paddingBottom: 'calc(var(--shell-bottom, 0px) + 96px)' }}>
                    <V3SectionForceOpen.Provider value={true}>{children}</V3SectionForceOpen.Provider>
                </div>
            </div>
        </div>,
        document.body,
    )
}

function EquipeDesligada({ onMudar, children }: { onMudar: () => void; children: ReactNode }) {
    const { colors } = useTheme()
    return (
        <div>
            <div className="rounded-3xl p-4 mb-4" style={{ background: '#06b6d414', border: '1px solid #06b6d455' }}>
                <p className="text-[14px] font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><AlertCircle size={16} style={{ color: '#0891b2' }} />A equipe está desligada</p>
                <p className="text-[12.5px] mt-1.5 leading-snug" style={{ color: colors.textPrimary }}>
                    A equipe são os entregadores e funcionários da própria loja, que levam os pedidos (cada um com o seu link). Hoje a loja usa o
                    <b> Entregador do iUser</b>: quem leva os pedidos é o iUser, então a equipe não recebe entregas.
                </p>
                <button onClick={onMudar} className="mt-3 h-10 px-4 rounded-full text-[12.5px] font-black text-white active:scale-95 transition" style={{ background: '#0891b2' }}>Mudar a entrega</button>
            </div>
            <div style={{ opacity: 0.45, pointerEvents: 'none' }} aria-hidden="true">{children}</div>
        </div>
    )
}
