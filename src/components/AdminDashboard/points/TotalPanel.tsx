// src/components/AdminDashboard/points/TotalPanel.tsx — Admin → Pontuação → Perfil total.
// O total novo = pontos da pessoa + o que as áreas dela rendem (sinais com "soma no dono") + bônus de diversidade. Roda em PARALELO ao ranking de hoje:
// aqui se compara os dois lado a lado e, só quando estiver bom, liga-se a chave que passa o Outdoor iUser e "Melhores perfis" para o total novo.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Save } from 'lucide-react'
import { toast } from '@/lib/toast'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import { AREA_INFO, POINTS_AREAS, bonusLabel, computeScore, validateDiversity, type PointsArea } from '@/modules/points'
import { Check, Field, inputStyle, type PanelProps, type SettingsRow } from './shared'

interface Row { rank: number; profile_id: string; total: number; name: string | null; slug: string | null; was?: number | null; areas?: any }
interface Compare { refreshed_at: string | null; use_total_score: boolean; today: Row[]; next: Row[] }

const pct = (v: number) => String(Math.round(v * 1000) / 10).replace('.', ',')
const parsePct = (s: string) => Number(String(s).replace(',', '.')) / 100

export default function TotalPanel({ settings, colors, cardStyle, reload }: { settings: SettingsRow } & PanelProps) {
    const [cmp, setCmp] = useState<Compare | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState<'save' | 'refresh' | null>(null)
    const [useTotal, setUseTotal] = useState(settings.use_total_score)
    const [step, setStep] = useState(pct(settings.diversity_step))
    const [max, setMax] = useState(pct(settings.diversity_max))
    const [share, setShare] = useState(pct(settings.diversity_max_share))
    const [minPts, setMinPts] = useState(String(settings.diversity_min_points))
    const [sim, setSim] = useState<Record<PointsArea, string>>(() => Object.fromEntries(POINTS_AREAS.map((a) => [a, a === 'pessoa' ? '100' : a === 'lojas' ? '80' : a === 'motoristas' ? '60' : '0'])) as Record<PointsArea, string>)
    const input = inputStyle(colors)

    const loadCompare = useCallback(async () => {
        try { setCmp(await callAdminApi<Compare>('/api/admin/points', { action: 'compare' })) }
        catch (e: any) { toast.error(e.message || 'Erro ao comparar') }
        setLoading(false)
    }, [])
    useEffect(() => { void loadCompare() }, [loadCompare, settings.refreshed_at])

    const cfg = { step: parsePct(step), max: parsePct(max), maxShare: parsePct(share), minPoints: Math.round(Number(minPts)) }
    const simResult = computeScore(Object.fromEntries(POINTS_AREAS.map((a) => [a, Number(sim[a]) || 0])) as Record<PointsArea, number>, cfg)
    const dirty = useTotal !== settings.use_total_score || cfg.step !== settings.diversity_step || cfg.max !== settings.diversity_max || cfg.maxShare !== settings.diversity_max_share || cfg.minPoints !== settings.diversity_min_points

    const save = async () => {
        const msg = validateDiversity(cfg)
        if (msg) { toast.error(msg); return }
        if (useTotal && !settings.use_total_score && !window.confirm('Ligar o total novo muda a ordem do Outdoor iUser e de "Melhores perfis" para todo mundo, agora. Continuar?')) return
        setBusy('save')
        try {
            await callAdminApi('/api/admin/points', { action: 'save_settings', use_total_score: useTotal, diversity_step: cfg.step, diversity_max: cfg.max, diversity_max_share: cfg.maxShare, diversity_min_points: cfg.minPoints })
            toast.success('Configurações salvas e recalculadas!')
            await reload(); await loadCompare()
        } catch (e: any) { toast.error(e.message || 'Erro ao salvar') }
        setBusy(null)
    }
    const refresh = async () => {
        setBusy('refresh')
        try { await callAdminApi('/api/admin/points', { action: 'refresh' }); toast.success('Recalculado!'); await reload(); await loadCompare() }
        catch (e: any) { toast.error(e.message || 'Erro ao recalcular') }
        setBusy(null)
    }

    const list = (title: string, rows: Row[], showWas: boolean) => (
        <div className="space-y-1.5 min-w-0">
            <p className="text-xs font-black" style={{ color: colors.textPrimary }}>{title}</p>
            {rows.length === 0 ? <p className="text-[11px]" style={{ color: colors.textSecondary }}>Ninguém ainda.</p> : rows.map((r) => (
                <div key={r.profile_id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate" style={{ color: colors.textPrimary }}><b>{r.rank}.</b> {r.name || 'Perfil'}</span>
                    <span className="flex items-center gap-1.5 flex-shrink-0">
                        {showWas && r.was != null && r.was !== r.rank && <span style={{ color: r.was > r.rank ? '#16a34a' : '#dc2626' }}>{r.was > r.rank ? '▲' : '▼'} era {r.was}º</span>}
                        {showWas && r.was == null && <span style={{ color: '#2563eb' }}>novo no topo</span>}
                        <b style={{ color: '#f97316' }}>{r.total.toLocaleString('pt-BR')}</b>
                    </span>
                </div>
            ))}
        </div>
    )

    return (
        <div className="space-y-4">
            <div style={cardStyle} className="space-y-2">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Total do perfil</p>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                    O total novo soma, para cada pessoa, os pontos dela com o que as áreas dela rendem (lojas, serviços, produtos, digitais, imóveis e motorista — só os sinais marcados como
                    “soma no total do dono”). Quem usa mais de uma área ganha um <b>bônus de diversidade</b>. Ele roda ao lado do ranking de hoje: compare abaixo e só então ligue a chave.
                </p>
                <Check colors={colors} checked={useTotal} onChange={setUseTotal}>Usar o total novo no Outdoor iUser e em “Melhores perfis”</Check>
                <p className="text-[11px]" style={{ color: useTotal ? '#b45309' : colors.textSecondary }}>
                    {useTotal ? 'Ligada: o ranking público já usa o total novo.' : 'Desligada: o ranking público segue como hoje (só os pontos das pessoas).'}
                </p>
            </div>

            <div style={cardStyle} className="space-y-3">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Bônus de diversidade</p>
                <div className="grid grid-cols-2 gap-3">
                    <Field colors={colors} label="Bônus por área extra (%)" hint="ex.: 10 = +10% por área além da primeira"><input value={step} onChange={(e) => setStep(e.target.value)} inputMode="decimal" style={input} /></Field>
                    <Field colors={colors} label="Bônus máximo (%)"><input value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" style={input} /></Field>
                    <Field colors={colors} label="Maior área até (% do total)" hint="acima disso, sem bônus"><input value={share} onChange={(e) => setShare(e.target.value)} inputMode="decimal" style={input} /></Field>
                    <Field colors={colors} label="Pontos para a área contar"><input type="number" min={1} value={minPts} onChange={(e) => setMinPts(e.target.value)} style={input} /></Field>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={save} disabled={busy !== null || !dirty} className="flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-black text-white disabled:opacity-50" style={{ background: colors.accent }}>
                        {busy === 'save' ? <Spinner size={14} color="#fff" /> : <Save size={14} />} Salvar e recalcular
                    </button>
                    <button onClick={refresh} disabled={busy !== null} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black disabled:opacity-50" style={{ background: `${colors.border}55`, color: colors.textPrimary }}>
                        {busy === 'refresh' ? <Spinner size={14} color={colors.textPrimary} /> : <RefreshCw size={14} />} Recalcular agora
                    </button>
                    <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                        {settings.refreshed_at ? `Última recontagem: ${new Date(settings.refreshed_at).toLocaleString('pt-BR')} (automática a cada 5 min)` : 'Ainda não foi recalculado'}
                    </span>
                </div>
            </div>

            <div style={cardStyle} className="space-y-3">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Simulador</p>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>Digite os pontos de uma pessoa em cada área para ver o total com as regras acima (não grava nada).</p>
                <div className="grid grid-cols-4 gap-2">
                    {POINTS_AREAS.map((a) => (
                        <Field key={a} colors={colors} label={AREA_INFO[a].label}>
                            <input type="number" value={sim[a]} onChange={(e) => setSim({ ...sim, [a]: e.target.value })} style={input} />
                        </Field>
                    ))}
                </div>
                <p className="text-xs" style={{ color: colors.textPrimary }}>
                    Soma <b>{simResult.raw.toLocaleString('pt-BR')}</b> · {simResult.activeAreas} {simResult.activeAreas === 1 ? 'área ativa' : 'áreas ativas'} · bônus <b>{bonusLabel(simResult.bonusPct) || 'nenhum'}</b> → total <b style={{ color: '#f97316' }}>{simResult.total.toLocaleString('pt-BR')} pts</b>
                </p>
            </div>

            <div style={cardStyle} className="space-y-3">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Ranking de hoje × com o total novo</p>
                {loading ? <div className="flex justify-center py-4"><Spinner size={20} color={colors.accent} /></div> : cmp && (
                    <div className="grid grid-cols-2 gap-4">
                        {list('Hoje (só os pontos da pessoa)', cmp.today, false)}
                        {list('Com o total novo', cmp.next, true)}
                    </div>
                )}
            </div>
        </div>
    )
}
