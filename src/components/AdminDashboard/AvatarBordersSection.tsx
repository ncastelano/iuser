// src/components/AdminDashboard/AvatarBordersSection.tsx
//
// Admin → Bordas: o catálogo de bordas de avatar. Aqui se liga/desliga cada borda, define como ela é
// conquistada (entra sozinha no Pré-pago, a pessoa resgata, ou só o admin concede), o prazo de resgate,
// as cores, e dá pra conceder uma borda a um perfil. A primeira é "Eu sou brasileiro".
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { callAdminApi } from '@/lib/callAdminApi'
import { Spinner } from '@/components/Spinner'
import { PlanRingFrame } from '@/components/PlanAvatarRing'
import type { ThemeColors } from '@/app/contexts/theme'

interface Border {
    id?: string
    slug: string
    name: string
    description: string | null
    colors: string[]
    is_active: boolean
    grant_mode: 'auto_prepaid' | 'claim' | 'admin_only'
    available_from: string | null
    available_until: string | null
    requires_prepaid: boolean
    for_hierarchy: boolean
    sort_order: number
    owners?: number
    using?: number
}

const MODE_LABEL: Record<Border['grant_mode'], string> = {
    auto_prepaid: 'Entra sozinha ao assinar o Pré-pago (no prazo) e já passa a usar',
    claim: 'A pessoa resgata e escolhe se usa',
    admin_only: 'Só o administrador concede',
}

const NEW_BORDER: Border = {
    slug: '', name: '', description: '', colors: ['#f97316', '#dc2626'], is_active: true, grant_mode: 'claim',
    available_from: null, available_until: null, requires_prepaid: false, for_hierarchy: false, sort_order: 0,
}

// ISO ⇄ <input type="datetime-local"> (horário local)
const toLocalInput = (iso: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)

export default function AvatarBordersSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [loading, setLoading] = useState(true)
    const [borders, setBorders] = useState<Border[]>([])
    const [editing, setEditing] = useState<Border | null>(null)
    const [saving, setSaving] = useState(false)
    const [grantProfile, setGrantProfile] = useState('')
    const [granting, setGranting] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const res = await callAdminApi<{ borders: Border[] }>('/api/admin/avatar-borders/list')
            setBorders(res.borders)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar as bordas')
        }
        setLoading(false)
    }, [])
    useEffect(() => { load() }, [load])

    const input: React.CSSProperties = { background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary, borderRadius: 12, padding: '8px 12px', fontSize: 13, width: '100%' }
    const label = (t: string) => <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>{t}</span>

    const save = async () => {
        if (!editing) return
        setSaving(true)
        try {
            await callAdminApi('/api/admin/avatar-borders/save', { ...editing })
            toast.success('Borda salva!')
            setEditing(null)
            await load()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar')
        } finally {
            setSaving(false)
        }
    }

    const toggleActive = async (b: Border) => {
        try {
            await callAdminApi('/api/admin/avatar-borders/save', { ...b, is_active: !b.is_active })
            await load()
        } catch (err: any) { toast.error(err.message || 'Erro') }
    }

    const grant = async (b: Border, action: 'grant' | 'revoke') => {
        if (!grantProfile.trim()) { toast.error('Informe o @ do perfil'); return }
        setGranting(b.id! + action)
        try {
            const res = await callAdminApi<{ name: string }>('/api/admin/avatar-borders/grant', { borderId: b.id, profileSlug: grantProfile, action })
            toast.success(action === 'grant' ? `Borda concedida a ${res.name}` : `Borda removida de ${res.name}`)
            await load()
        } catch (err: any) { toast.error(err.message || 'Erro') }
        setGranting(null)
    }

    if (loading) return <div style={cardStyle} className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>

    const preview = (cs: string[]) => (
        <span className="p-2 inline-flex">
            <PlanRingFrame colors={cs.length >= 2 ? cs : undefined} width={3}>
                <span className="w-12 h-12 rounded-full inline-block" style={{ background: '#d1d5db' }} />
            </PlanRingFrame>
        </span>
    )

    return (
        <div className="space-y-5">
            <div style={cardStyle} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Bordas de avatar</p>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>
                            As bordas que existem e como cada uma é conquistada. As pessoas escolhem qual usar em Informações do Perfil → Bordas.
                        </p>
                    </div>
                    <button onClick={() => setEditing({ ...NEW_BORDER })} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black text-white flex-shrink-0" style={{ background: colors.accent }}>
                        <Plus size={14} /> Nova borda
                    </button>
                </div>
                <div className="flex items-center gap-2 pt-1">
                    <input value={grantProfile} onChange={(e) => setGrantProfile(e.target.value)} placeholder="@ do perfil pra conceder/remover uma borda" style={{ ...input, maxWidth: 360 }} />
                </div>
            </div>

            {borders.map((b) => (
                <div key={b.id} style={cardStyle} className="space-y-3">
                    <div className="flex items-center gap-3">
                        {preview(b.colors)}
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>
                                {b.name} <span className="text-[10px] font-bold" style={{ color: colors.textSecondary }}>({b.slug})</span>
                            </p>
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>{MODE_LABEL[b.grant_mode]}</p>
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                {b.owners} {b.owners === 1 ? 'pessoa tem' : 'pessoas têm'} · {b.using} {b.using === 1 ? 'usa' : 'usam'}
                                {b.available_until && ` · resgate até ${new Date(b.available_until).toLocaleDateString('pt-BR')}`}
                                {b.for_hierarchy && ' · toda a hierarquia'}
                                {b.requires_prepaid && ' · exige Pré-pago'}
                            </p>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-bold flex-shrink-0 cursor-pointer" style={{ color: colors.textPrimary }}>
                            <input type="checkbox" checked={b.is_active} onChange={() => toggleActive(b)} className="w-4 h-4 accent-orange-500" />
                            Ativa
                        </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setEditing({ ...b })} className="px-4 py-1.5 rounded-full text-xs font-black" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}>Editar</button>
                        <button onClick={() => grant(b, 'grant')} disabled={granting !== null} className="px-4 py-1.5 rounded-full text-xs font-black text-white disabled:opacity-50" style={{ background: colors.accent }}>
                            {granting === b.id! + 'grant' ? <Spinner size={12} color="#fff" /> : 'Conceder ao perfil'}
                        </button>
                        <button onClick={() => grant(b, 'revoke')} disabled={granting !== null} className="px-4 py-1.5 rounded-full text-xs font-black disabled:opacity-50" style={{ border: `1px solid #ef444460`, color: '#ef4444' }}>
                            {granting === b.id! + 'revoke' ? <Spinner size={12} /> : 'Remover do perfil'}
                        </button>
                    </div>
                </div>
            ))}

            {editing && (
                <div style={cardStyle} className="space-y-3">
                    <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{editing.id ? `Editar "${editing.name}"` : 'Nova borda'}</p>
                    <div className="flex items-center gap-3">
                        {preview(editing.colors)}
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>Prévia girando com as cores abaixo</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-0.5">{label('Nome')}<input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={input} /></div>
                        <div className="flex flex-col gap-0.5">{label(editing.id ? 'Slug (fixo)' : 'Slug (letras minúsculas, - e _)')}<input value={editing.slug} disabled={!!editing.id} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} style={{ ...input, opacity: editing.id ? 0.6 : 1 }} /></div>
                    </div>
                    <div className="flex flex-col gap-0.5">{label('Descrição (aparece pra pessoa)')}<input value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} style={input} /></div>

                    <div className="flex flex-col gap-1">
                        {label('Cores (de 2 a 12, na ordem em que giram)')}
                        <div className="flex flex-wrap items-center gap-2">
                            {editing.colors.map((c, i) => (
                                <span key={i} className="flex items-center gap-1">
                                    <input type="color" value={c} onChange={(e) => setEditing({ ...editing, colors: editing.colors.map((x, k) => (k === i ? e.target.value : x)) })} style={{ width: 36, height: 30, border: 'none', background: 'none', padding: 0 }} />
                                    {editing.colors.length > 2 && (
                                        <button onClick={() => setEditing({ ...editing, colors: editing.colors.filter((_, k) => k !== i) })} aria-label="Remover cor" style={{ color: colors.textSecondary }}><Trash2 size={12} /></button>
                                    )}
                                </span>
                            ))}
                            {editing.colors.length < 12 && (
                                <button onClick={() => setEditing({ ...editing, colors: [...editing.colors, '#ffffff'] })} className="px-3 py-1 rounded-full text-[11px] font-black" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}>+ cor</button>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-0.5">
                        {label('Como é conquistada')}
                        <select value={editing.grant_mode} onChange={(e) => setEditing({ ...editing, grant_mode: e.target.value as Border['grant_mode'] })} style={input}>
                            {(Object.keys(MODE_LABEL) as Border['grant_mode'][]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex flex-col gap-0.5">{label('Resgate abre em (opcional)')}<input type="datetime-local" value={toLocalInput(editing.available_from)} onChange={(e) => setEditing({ ...editing, available_from: fromLocalInput(e.target.value) })} style={input} /></div>
                        <div className="flex flex-col gap-0.5">{label('Resgate vai até (opcional)')}<input type="datetime-local" value={toLocalInput(editing.available_until)} onChange={(e) => setEditing({ ...editing, available_until: fromLocalInput(e.target.value) })} style={input} /></div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-xs font-bold cursor-pointer" style={{ color: colors.textPrimary }}>
                            <input type="checkbox" checked={editing.requires_prepaid} onChange={(e) => setEditing({ ...editing, requires_prepaid: e.target.checked })} className="w-4 h-4 accent-orange-500" /> Exige o plano Pré-pago pra resgatar
                        </label>
                        <label className="flex items-center gap-2 text-xs font-bold cursor-pointer" style={{ color: colors.textPrimary }}>
                            <input type="checkbox" checked={editing.for_hierarchy} onChange={(e) => setEditing({ ...editing, for_hierarchy: e.target.checked })} className="w-4 h-4 accent-orange-500" /> Toda a hierarquia ganha (com plano ou sem)
                        </label>
                        <label className="flex items-center gap-2 text-xs font-bold cursor-pointer" style={{ color: colors.textPrimary }}>
                            <input type="checkbox" checked={editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} className="w-4 h-4 accent-orange-500" /> Ativa
                        </label>
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-black text-white disabled:opacity-50" style={{ background: colors.accent }}>
                            {saving ? <Spinner size={14} color="#fff" /> : <Save size={14} />} Salvar
                        </button>
                        <button onClick={() => setEditing(null)} className="px-5 py-2 rounded-full text-xs font-black" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}>Cancelar</button>
                    </div>
                </div>
            )}
        </div>
    )
}
