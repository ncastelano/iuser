// src/components/AdminDashboard/DownloadBandwidthCard.tsx — Admin → Uploads: ESTIMATIVA DE BANDA dos downloads de programas. A banda (saída de dados) é o que estourou o Supabase em outubro; o app
// só mede respostas de API, não arquivos baixados/tocados, então aqui se ESTIMA: tamanho do arquivo × downloads contados (1 por pessoa por dia). Mostra os últimos dias, o mês até agora, a
// projeção do mês e os arquivos que mais pesam. Música tocada e aula assistida NÃO entram (não há contagem) — por isso é um piso, não o total.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { callAdminApi } from '@/lib/callAdminApi'
import { formatBytes, gbText } from '@/modules/uploads'

interface Bandwidth { days: number; downloads: number; est_bytes: number; month_downloads: number; month_est_bytes: number; month_projection_bytes: number; items: { item_id: string; product_name: string; store_name: string | null; platform: string | null; version: string | null; size_bytes: number; downloads: number; est_bytes: number }[] }

/** Cota de banda do plano gratuito do Supabase (5 GB/mês de "Cached Egress"); confira o seu plano no painel do Supabase */
const FREE_QUOTA = 5 * 1024 * 1024 * 1024

export default function DownloadBandwidthCard({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: { textPrimary: string; textSecondary: string; border: string } }) {
    const [days, setDays] = useState(30)
    const [bw, setBw] = useState<Bandwidth | null>(null)
    const [err, setErr] = useState<string | null>(null)
    const load = useCallback(async () => {
        try { const r = await callAdminApi<{ bandwidth: Bandwidth }>('/api/admin/uploads', { action: 'bandwidth', days }); setBw(r.bandwidth); setErr(null) } catch (e: any) { setErr(e?.message || 'Não deu para calcular.') }
    }, [days])
    useEffect(() => { load() }, [load])

    const pct = bw ? Math.round((bw.month_projection_bytes / FREE_QUOTA) * 100) : 0
    const tone = pct >= 90 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#22c55e'
    return (
        <div style={cardStyle} className="flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h3 className="text-sm font-black" style={{ color: colors.textPrimary }}>Banda estimada dos downloads (programas)</h3>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>Tamanho × downloads contados. É um <b>piso</b>: música tocada e aula assistida ainda não entram na conta. A banda é o que bloqueou o projeto em outubro.</p>
                </div>
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="text-xs rounded-lg px-2 py-1 flex-shrink-0" style={{ background: `${colors.border}40`, color: colors.textPrimary, border: `1px solid ${colors.border}` }} aria-label="Período">
                    <option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option>
                </select>
            </div>
            {err && <p className="text-xs font-bold" style={{ color: '#ef4444' }}>{err}</p>}
            {bw && (
                <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl p-2" style={{ background: `${colors.border}30` }}><p className="text-base font-black" style={{ color: colors.textPrimary }}>{gbText(bw.est_bytes)}</p><p className="text-[10px]" style={{ color: colors.textSecondary }}>em {bw.days} dias · {bw.downloads} downloads</p></div>
                        <div className="rounded-xl p-2" style={{ background: `${colors.border}30` }}><p className="text-base font-black" style={{ color: colors.textPrimary }}>{gbText(bw.month_est_bytes)}</p><p className="text-[10px]" style={{ color: colors.textSecondary }}>no mês até agora · {bw.month_downloads}</p></div>
                        <div className="rounded-xl p-2" style={{ background: `${tone}18`, border: `1px solid ${tone}55` }}><p className="text-base font-black" style={{ color: tone }}>{gbText(bw.month_projection_bytes)}</p><p className="text-[10px]" style={{ color: colors.textSecondary }}>projeção do mês ({pct}% de 5 GB)</p></div>
                    </div>
                    {pct >= 60 && <p className="text-xs font-bold" style={{ color: tone }}>Só os downloads de programa já projetam {pct}% da cota de banda do plano gratuito{pct >= 100 ? ' — vai estourar' : ''}. Antes de abrir mais, passe os programas para o R2 ou o plano pago.</p>}
                    {bw.items.length === 0 ? (
                        <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhum download de programa no período.</p>
                    ) : (
                        <div className="flex flex-col gap-1">
                            <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>Os que mais pesam</p>
                            {bw.items.slice(0, 8).map((i) => (
                                <div key={i.item_id} className="flex items-center gap-2 text-xs rounded-lg px-2 py-1.5" style={{ background: `${colors.border}25` }}>
                                    <span className="min-w-0 flex-1 truncate" style={{ color: colors.textPrimary }}><b>{i.product_name}</b>{i.version ? ` · v${i.version}` : ''}{i.store_name ? <span style={{ color: colors.textSecondary }}> · {i.store_name}</span> : null}</span>
                                    <span className="flex-shrink-0 font-bold" style={{ color: colors.textSecondary }}>{formatBytes(i.size_bytes)} × {i.downloads}</span>
                                    <span className="flex-shrink-0 font-black" style={{ color: colors.textPrimary }}>{gbText(i.est_bytes)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
