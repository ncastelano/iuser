// app/(main)/(shell)/painel-loja/[storeSlug]/mesas/page.tsx — QR NA MESA (migration 20261130000086), só a dona da loja.
// A loja imprime cartões de mesa/balcão com a LOGO dela e um QR que abre o cardápio no iUser (/<loja>/catalogo?mesa=N). Cada leitura é
// contada (record_qr_scan, no catálogo) e aparece aqui: hoje, 7 e 30 dias e as mesas que mais leem.
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { Printer, QrCode, Minus, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from '@/lib/toast'
import Header from '@/components/Header'
import { proxyImageUrl } from '@/lib/imageProxy'
import { tableCardsPdf } from '@/lib/printCards'

const ORANGE = '#f97316'
interface MyStore { id: string; name: string; logo: string | null }
type Stats = { today: number; week: number; month: number; tables: { table_no: number; scans: number }[] }

export default function MesasDaLojaPage() {
    const router = useRouter()
    const params = useParams()
    const storeSlug = (Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug) || ''
    const { colors } = useTheme()
    const { userId, loading } = useProfile()
    const [store, setStore] = useState<MyStore | null | undefined>(undefined)
    const [tables, setTables] = useState(10)
    const [counter, setCounter] = useState(true)
    const [preview, setPreview] = useState<string | null>(null)
    const [stats, setStats] = useState<Stats | null>(null)

    useEffect(() => {
        if (loading) return
        if (!userId) { setStore(null); return }
        let cancelled = false
        supabase.from('stores').select('id, name, logo_url').eq('storeSlug', storeSlug).eq('owner_id', userId).maybeSingle()
            .then(({ data }) => { if (!cancelled) setStore(data ? { id: data.id, name: data.name, logo: data.logo_url ? proxyImageUrl(data.logo_url) : null } : null) })
        return () => { cancelled = true }
    }, [userId, loading, storeSlug])

    useEffect(() => {
        if (!store) return
        supabase.rpc('get_store_qr_stats', { p_store: store.id }).then(({ data }) => { if (data) setStats(data as Stats) })
        QRCode.toDataURL(link(1), { margin: 0, width: 220 }).then(setPreview).catch(() => {})
    }, [store]) // eslint-disable-line react-hooks/exhaustive-deps

    const link = (mesa: number) => `${window.location.origin}/${encodeURIComponent(storeSlug)}/catalogo?mesa=${mesa}`

    const [making, setMaking] = useState(false)
    const print = async () => {
        if (!store) return
        const list: { label: string; url: string }[] = []
        if (counter) list.push({ label: 'Balcão', url: link(0) })
        for (let i = 1; i <= tables; i++) list.push({ label: `Mesa ${i}`, url: link(i) })
        if (!list.length) { toast.info('Escolha ao menos uma mesa ou o balcão.'); return }
        setMaking(true)
        try { await tableCardsPdf({ storeName: store.name, logoUrl: store.logo, items: list }); toast.success('PDF baixado: é só imprimir') }
        catch { toast.error('Não deu para gerar o PDF. Tente de novo.') }
        finally { setMaking(false) }
    }

    const back = () => router.push(`/painel-loja/${encodeURIComponent(storeSlug)}`)
    const card = { background: colors.surface, border: `1px solid ${colors.border}` }

    return (
        <div className="pb-28">
            <Header title="QR na mesa" showBack onBack={back} />
            {loading || store === undefined ? (
                <div className="mt-4 h-40 rounded-3xl animate-pulse" style={{ background: `${colors.border}40` }} />
            ) : !store ? (
                <div className="mt-6 rounded-3xl p-6 text-center" style={card}>
                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Esta loja não foi encontrada na sua conta.</p>
                </div>
            ) : (
                <div className="mt-3 flex flex-col gap-3">
                    <div className="rounded-3xl p-4 flex gap-4 items-center" style={card}>
                        {preview && <img src={preview} alt="QR do cardápio" className="w-24 h-24 rounded-xl p-1.5 bg-white flex-shrink-0" />}
                        <div className="min-w-0">
                            <p className="text-[15px] font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><QrCode size={17} style={{ color: ORANGE }} /> Cardápio com QR, com a sua logo</p>
                            <p className="text-[12.5px] mt-1 leading-snug" style={{ color: colors.textSecondary }}>
                                O cliente aponta a câmera, vê o cardápio da {store.name} e pede pelo celular, sem baixar nada. Cada cartão tem o número da mesa e as leituras são contadas aqui.
                            </p>
                        </div>
                    </div>

                    <div className="rounded-3xl p-4" style={card}>
                        <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>Quantas mesas?</p>
                        <div className="mt-2 flex items-center gap-3">
                            <button onClick={() => setTables((n) => Math.max(0, n - 1))} aria-label="Menos" className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><Minus size={17} /></button>
                            <span className="text-[22px] font-black w-12 text-center" style={{ color: colors.textPrimary }}>{tables}</span>
                            <button onClick={() => setTables((n) => Math.min(60, n + 1))} aria-label="Mais" className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><Plus size={17} /></button>
                        </div>
                        <label className="mt-3 flex items-center gap-2 text-[13px]" style={{ color: colors.textPrimary }}>
                            <input type="checkbox" checked={counter} onChange={(e) => setCounter(e.target.checked)} className="w-4 h-4 accent-orange-500" /> Também um cartão para o balcão / vitrine
                        </label>
                        <button onClick={print} disabled={making} className="disabled:opacity-60 mt-4 w-full h-12 rounded-full text-[14px] font-black text-white flex items-center justify-center gap-2" style={{ background: ORANGE }}>
                            <Printer size={17} /> {making ? 'Gerando o PDF…' : `Baixar ${tables + (counter ? 1 : 0)} cartões em PDF`}
                        </button>
                        <p className="text-[11px] mt-2" style={{ color: colors.textSecondary }}>Dica: imprima em papel mais grosso e dobre ao meio, ou use um display de acrílico.</p>
                    </div>

                    {stats && (
                        <div className="rounded-3xl p-4" style={card}>
                            <p className="text-[13px] font-black" style={{ color: colors.textPrimary }}>Leituras do QR</p>
                            <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                                {([['Hoje', stats.today], ['7 dias', stats.week], ['30 dias', stats.month]] as const).map(([l, v]) => (
                                    <div key={l} className="rounded-xl p-2" style={{ background: `${colors.border}25` }}>
                                        <p className="text-[18px] font-black" style={{ color: colors.textPrimary }}>{v}</p>
                                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>{l}</p>
                                    </div>
                                ))}
                            </div>
                            {stats.tables.length > 0 && (
                                <p className="text-[12px] mt-3" style={{ color: colors.textSecondary }}>
                                    Mais lidas: {stats.tables.slice(0, 5).map((t) => `${t.table_no === 0 ? 'balcão' : `mesa ${t.table_no}`} (${t.scans})`).join(' · ')}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
