'use client'

// O CATÁLOGO da loja na 3.0 (Editar loja → Catálogo), no desenho do laboratório /painel-teste, com os dados reais:
// abas = ambientes (Produtos · Digitais · Serviços, só os que fazem sentido, cada uma com a contagem), busca, "Novo", "Ver como cliente",
// as PROMOÇÕES (o editor de combos de sempre) no alto de Produtos, chips de categoria com a contagem e uma LINHA por item (foto, nome,
// categoria, preço, ESGOTADO / restam N) com o interruptor "no ar" (`products.is_active`). Tocar no item abre a edição completa de sempre.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Eye, GraduationCap, Package, Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { useTheme } from '@/app/contexts/theme'
import CategoryOrderSheet from './CategoryOrderSheet'
import { orderCategories } from '@/lib/categoryOrder'

export type CatAba = 'produtos' | 'digitais' | 'servicos'
const ORANGE = '#f97316'
const COR: Record<CatAba, string> = { produtos: ORANGE, digitais: '#8b5cf6', servicos: '#14b8a6' }
const NOME: Record<CatAba, string> = { produtos: 'Produtos', digitais: 'Digitais', servicos: 'Serviços' }
const FRASE: Record<CatAba, string> = {
    produtos: 'O que a loja vende e entrega. As promoções (combos) ficam no alto.',
    digitais: 'Cursos, músicas, livros e programas: o acesso é liberado depois do pagamento.',
    servicos: 'O que o cliente agenda: duração e valor (opcional).',
}
const ICONE: Record<CatAba, ReactNode> = { produtos: <Package size={15} />, digitais: <GraduationCap size={15} />, servicos: <CalendarDays size={15} /> }
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface Item { id: string; name: string; price: number; image_url: string | null; slug: string | null; category: string | null; type: string; is_active: boolean; is_combo: boolean; stock_quantity: number | null; listing_type: string | null }

const abaDe = (t: string): CatAba => (t === 'service' ? 'servicos' : t === 'digital' ? 'digitais' : 'produtos')

export default function CatalogoV3({ storeId, storeSlug, hasServices, aba, onAba, promocoes, categoryOrder, onCategoryOrder }: {
    storeId: string
    storeSlug: string
    hasServices: boolean
    aba: CatAba
    onAba: (a: CatAba) => void
    /** o editor de combos de sempre (StorePromotions), no alto de Produtos */
    promocoes: ReactNode
    categoryOrder: string[] | null
    onCategoryOrder: (o: string[]) => void
}) {
    const { colors: c } = useTheme()
    const router = useRouter()
    const [itens, setItens] = useState<Item[] | null>(null)
    const [cat, setCat] = useState('Todos')
    const [q, setQ] = useState('')
    const [ordenar, setOrdenar] = useState(false)

    const load = useCallback(async () => {
        const { data, error } = await supabase.from('products')
            .select('id, name, price, image_url, slug, category, type, is_active, is_combo, stock_quantity, listing_type')
            .eq('store_id', storeId).eq('listing_type', 'sale').order('created_at', { ascending: false }).limit(1000)
        if (error) { setItens([]); return }
        setItens(((data || []) as any[]).map((p) => ({
            ...p,
            image_url: p.image_url ? (p.image_url.startsWith('http') ? p.image_url : supabase.storage.from('product-images').getPublicUrl(p.image_url).data.publicUrl) : null,
        })))
    }, [storeId])
    useEffect(() => { load() }, [load])

    const abas: CatAba[] = useMemo(() => (['produtos', 'digitais', ...(hasServices || (itens || []).some((i) => i.type === 'service') ? ['servicos' as CatAba] : [])]), [hasServices, itens])
    const cor = COR[aba]
    // combos aparecem nas Promoções, não na lista
    const lista = useMemo(() => (itens || []).filter((i) => abaDe(i.type) === aba && !i.is_combo), [itens, aba])
    const cats = useMemo(() => orderCategories([...new Set(lista.map((i) => i.category || 'Sem categoria'))], categoryOrder, (k) => lista.filter((i) => (i.category || 'Sem categoria') === k).length), [lista, categoryOrder])
    useEffect(() => { setCat('Todos'); setQ('') }, [aba])
    const filtrados = lista.filter((i) => (cat === 'Todos' || (i.category || 'Sem categoria') === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase())))
    const noAr = lista.filter((i) => i.is_active).length
    const conta = (a: CatAba) => (itens || []).filter((i) => abaDe(i.type) === a && !i.is_combo).length
    const combos = (itens || []).filter((i) => i.is_combo)

    const liga = async (i: Item, v: boolean) => {
        setItens((m) => (m || []).map((x) => (x.id === i.id ? { ...x, is_active: v } : x)))
        const { error } = await supabase.from('products').update({ is_active: v }).eq('id', i.id)
        if (error) {
            setItens((m) => (m || []).map((x) => (x.id === i.id ? { ...x, is_active: !v } : x)))
            toast.error('Não deu para mudar agora', { description: error.message })
            return
        }
        toast.success(v ? `“${i.name}” está no ar` : `“${i.name}” saiu do ar`, { description: v ? undefined : 'Não foi apagado: ligue de novo quando quiser.' })
    }
    const novo = () => router.push(`/${storeSlug}/criar-produto${aba === 'servicos' ? '?type=service' : aba === 'digitais' ? '?type=digital' : ''}`)

    return (
        <>
            {/* abas = ambientes, como no catálogo do cliente */}
            <div className="flex gap-1.5 mb-2">
                {abas.map((a) => (
                    <button key={a} onClick={() => onAba(a)} aria-pressed={aba === a} className="flex-1 h-12 rounded-2xl text-[12.5px] font-black flex flex-col items-center justify-center leading-none gap-0.5 active:scale-95 transition"
                        style={aba === a ? { background: COR[a], color: '#fff' } : { border: `1.5px solid ${c.border}`, color: c.textPrimary }}>
                        <span className="flex items-center gap-1">{ICONE[a]}{NOME[a]}</span>
                        <span className="text-[10.5px] font-bold" style={{ opacity: 0.85 }}>{itens ? conta(a) : '…'}{a === 'produtos' && combos.length > 0 ? ` · ${combos.filter((x) => x.is_active).length} combos` : ''}</span>
                    </button>
                ))}
            </div>
            <p className="text-[11.5px] leading-snug mb-3 px-1" style={{ color: c.textSecondary }}>{FRASE[aba]}</p>

            <div className="flex gap-2 mb-3">
                <label className="flex-1 h-11 rounded-full px-3.5 flex items-center gap-2 text-[13px] min-w-0" style={{ background: c.surface, border: `1.5px solid ${c.border}` }}>
                    <Search size={15} style={{ color: c.textSecondary }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar em ${NOME[aba].toLowerCase()}`} className="flex-1 min-w-0 bg-transparent outline-none text-[13px]" style={{ color: c.textPrimary }} />
                </label>
                <button onClick={novo} className="h-11 px-4 rounded-full text-[13px] font-black text-white flex items-center gap-1 active:scale-95 flex-shrink-0" style={{ background: cor }}><Plus size={16} />Novo</button>
            </div>
            <div className="flex gap-2 mb-3">
                <button onClick={() => router.push(`/${storeSlug}/catalogo`)} className="flex-1 h-10 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ border: `1px solid ${c.border}`, color: c.textPrimary }}><Eye size={14} />Ver como cliente</button>
                {cats.length > 1 && <button onClick={() => setOrdenar(true)} className="flex-1 h-10 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ border: `1px solid ${c.border}`, color: c.textPrimary }}>Ordenar categorias</button>}
            </div>

            {aba === 'produtos' && !q && cat === 'Todos' && <div id="editar-promocoes" className="mb-4 scroll-mt-20">{promocoes}</div>}

            {lista.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-3" style={{ scrollbarWidth: 'none' }}>
                    {['Todos', ...cats].map((t) => (
                        <button key={t} onClick={() => setCat(t)} className="h-9 px-3.5 rounded-full text-[12.5px] font-black flex-shrink-0 active:scale-95" style={cat === t ? { background: cor, color: '#fff' } : { border: `1px solid ${c.border}`, color: c.textPrimary }}>
                            {t}<span className="ml-1.5 text-[11px] font-bold" style={{ opacity: 0.75 }}>{t === 'Todos' ? lista.length : lista.filter((i) => (i.category || 'Sem categoria') === t).length}</span>
                        </button>
                    ))}
                </div>
            )}

            {itens === null ? (
                <div className="rounded-3xl overflow-hidden" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                    {[0, 1, 2, 3].map((n) => <div key={n} className="h-[68px] animate-pulse" style={{ borderTop: n ? `1px solid ${c.border}` : undefined, background: `${c.border}22` }} />)}
                </div>
            ) : lista.length === 0 ? (
                <div className="rounded-3xl p-6 text-center" style={{ border: `1.5px dashed ${c.border}` }}>
                    <p className="text-[15px] font-black" style={{ color: c.textPrimary }}>{aba === 'servicos' ? 'Nenhum serviço ainda' : aba === 'digitais' ? 'Nenhum conteúdo digital ainda' : 'Seu catálogo está vazio'}</p>
                    <p className="text-[12.5px] mt-1 leading-snug" style={{ color: c.textSecondary }}>{aba === 'servicos' ? 'Rodízio, mesa, consulta, aula… o cliente escolhe o horário e você aceita.' : aba === 'digitais' ? 'Curso, música, audiolivro, e-book ou programa: venda ou dê de graça.' : 'Comece com 3 produtos: foto, nome e preço bastam. Você completa depois.'}</p>
                    <button onClick={novo} className="mt-4 h-11 px-5 rounded-full text-[13px] font-black text-white" style={{ background: cor }}>{aba === 'servicos' ? 'Adicionar serviço' : aba === 'digitais' ? 'Publicar o primeiro conteúdo' : 'Adicionar o primeiro produto'}</button>
                </div>
            ) : (
                <>
                    <div className="rounded-3xl overflow-hidden" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                        {filtrados.length === 0 && <p className="text-[12.5px] text-center py-6" style={{ color: c.textSecondary }}>Nada encontrado.</p>}
                        {filtrados.map((i, n) => {
                            const est = i.stock_quantity
                            const esg = aba === 'produtos' && est === 0
                            return (
                                <div key={i.id} className="flex items-center gap-3 px-3 py-2.5" style={{ borderTop: n ? `1px solid ${c.border}` : undefined, opacity: i.is_active ? 1 : 0.55 }}>
                                    <button onClick={() => router.push(`/${storeSlug}/${i.slug || i.id}/editar`)} className="flex items-center gap-3 min-w-0 flex-1 text-left active:opacity-70">
                                        <span className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: `${cor}1f`, color: cor }}>
                                            {i.image_url ? <img src={i.image_url} alt="" className="w-full h-full object-cover" /> : ICONE[aba]}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[13.5px] font-black leading-tight truncate" style={{ color: c.textPrimary }}>{i.name}</span>
                                            <span className="block text-[11.5px] leading-tight mt-0.5 truncate" style={{ color: c.textSecondary }}>{i.category || 'Sem categoria'}</span>
                                            <span className="flex items-center gap-1.5 mt-0.5">
                                                <span className="text-[13px] font-black" style={{ color: c.textPrimary }}>{Number(i.price) === 0 ? (aba === 'servicos' ? 'A combinar' : 'Grátis') : brl(Number(i.price))}</span>
                                                {esg && <span className="px-1.5 h-4 rounded-full text-[9.5px] font-black text-white flex items-center" style={{ background: '#ef4444' }}>ESGOTADO</span>}
                                                {aba === 'produtos' && est !== null && est > 0 && est <= 5 && <span className="px-1.5 h-4 rounded-full text-[9.5px] font-black flex items-center" style={{ background: '#eab30833', color: '#a16207' }}>restam {est}</span>}
                                            </span>
                                        </span>
                                    </button>
                                    <button role="switch" aria-checked={i.is_active} aria-label={`${i.name} no ar`} onClick={() => liga(i, !i.is_active)} className="relative w-11 h-6 rounded-full flex-shrink-0 transition" style={{ background: i.is_active ? cor : c.border }}>
                                        <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all" style={{ left: i.is_active ? 22 : 2 }} />
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                    <p className="text-[11.5px] text-center mt-3" style={{ color: c.textSecondary }}>{noAr} de {lista.length} no ar · desligar o interruptor tira do ar sem apagar.</p>
                </>
            )}

            {ordenar && <CategoryOrderSheet storeId={storeId} cor={cor} titulo={NOME[aba]} cats={cats} conta={(k) => lista.filter((i) => (i.category || 'Sem categoria') === k).length}
                onClose={() => setOrdenar(false)} onSaved={(o) => { onCategoryOrder(o); setOrdenar(false) }} fullOrder={categoryOrder} />}
        </>
    )
}
