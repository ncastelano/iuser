// components/AdminDashboard/AdminDashboard.tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTheme, type ThemeColors } from '@/app/contexts/theme'
import { supabase } from '@/lib/supabase/client'
import { Spinner } from '@/components/Spinner'
import { toast } from 'sonner'
import { hexToRgb } from '@/lib/color'
import { Wallet, KeyRound, Users, Settings as SettingsIcon, Check, X, Copy, Plus, ShieldOff } from 'lucide-react'

type Section = 'pagamentos' | 'codigos' | 'administradores' | 'configuracoes'

async function callAdminApi<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(path, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify(body || {}),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Erro na requisição')
    return json as T
}

function formatCents(cents: number | null) {
    if (cents === null) return '—'
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const SECTIONS: { id: Section; label: string; icon: typeof Wallet }[] = [
    { id: 'pagamentos', label: 'Pagamentos', icon: Wallet },
    { id: 'codigos', label: 'Códigos', icon: KeyRound },
    { id: 'administradores', label: 'Administradores', icon: Users },
    { id: 'configuracoes', label: 'Configurações', icon: SettingsIcon },
]

// Painel do administrador geral - mesma "casca" visual de ProfileDashboard /
// StoreDashboard, aberto como aba do Header em OwnerClientPage. Só a conta
// ncastelano@gmail.com chega a montar isso (o tab nem existe pra mais
// ninguém), mas cada ação de verdade ainda re-verifica no servidor.
export default function AdminDashboard() {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)
    const [section, setSection] = useState<Section>('pagamentos')
    const [checking, setChecking] = useState(true)
    const [authorized, setAuthorized] = useState(false)

    useEffect(() => {
        callAdminApi<{ isSuperAdmin: boolean }>('/api/admin/whoami')
            .then((r) => setAuthorized(r.isSuperAdmin))
            .catch(() => setAuthorized(false))
            .finally(() => setChecking(false))
    }, [])

    const cardStyle = {
        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
        border: `1px solid ${colors.border}`,
        borderRadius: 20,
        padding: 16,
    }

    if (checking) {
        return (
            <div className="flex items-center justify-center py-16">
                <Spinner size={32} color={colors.accent} />
            </div>
        )
    }

    if (!authorized) {
        return (
            <div style={cardStyle} className="flex flex-col items-center gap-2 py-10 text-center">
                <ShieldOff size={28} color={colors.textSecondary} />
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Sem permissão</p>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            <div className="flex gap-2 overflow-x-auto pb-1">
                {SECTIONS.map((s) => {
                    const Icon = s.icon
                    const active = section === s.id
                    return (
                        <button
                            key={s.id}
                            onClick={() => setSection(s.id)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all"
                            style={{
                                background: active ? colors.accent : `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                                color: active ? colors.accentText : colors.textPrimary,
                                border: `1px solid ${active ? colors.accent : colors.border}`,
                            }}
                        >
                            <Icon size={14} />
                            {s.label}
                        </button>
                    )
                })}
            </div>

            {section === 'pagamentos' && <PaymentsSection cardStyle={cardStyle} colors={colors} />}
            {section === 'codigos' && <CodesSection cardStyle={cardStyle} colors={colors} />}
            {section === 'administradores' && <AdminsSection cardStyle={cardStyle} colors={colors} />}
            {section === 'configuracoes' && <SettingsSection cardStyle={cardStyle} colors={colors} />}
        </div>
    )
}

interface SectionProps {
    cardStyle: React.CSSProperties
    colors: ThemeColors
}

interface PaymentRow {
    id: string
    status: 'pending' | 'approved' | 'rejected' | 'consumed'
    amount_cents: number | null
    grant_type: 'days' | 'lifetime' | null
    days: number | null
    requested_at: string
    profiles: { name: string | null; profileSlug: string | null } | null
}

function PaymentsSection({ cardStyle, colors }: SectionProps) {
    const [payments, setPayments] = useState<PaymentRow[]>([])
    const [loading, setLoading] = useState(true)
    const [actingId, setActingId] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const { payments } = await callAdminApi<{ payments: PaymentRow[] }>('/api/admin/access-payments/list')
            setPayments(payments)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar pagamentos')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const review = async (grantId: string, action: 'approve' | 'reject') => {
        setActingId(grantId)
        try {
            await callAdminApi('/api/admin/access-payments/review', { grantId, action })
            toast.success(action === 'approve' ? 'Pagamento aprovado!' : 'Pedido rejeitado')
            await load()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao revisar pedido')
        } finally {
            setActingId(null)
        }
    }

    if (loading) {
        return <div className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>
    }

    const pending = payments.filter((p) => p.status === 'pending')
    const reviewed = payments.filter((p) => p.status !== 'pending')

    return (
        <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                Pendentes ({pending.length})
            </p>
            {pending.length === 0 && (
                <div className="text-sm" style={{ ...cardStyle, color: colors.textSecondary }}>
                    Nenhum pagamento aguardando confirmação.
                </div>
            )}
            {pending.map((p) => (
                <div key={p.id} style={cardStyle} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                            {p.profiles?.name || (p.profiles?.profileSlug ? `@${p.profiles.profileSlug}` : 'Usuário')}
                        </p>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                            {p.profiles?.profileSlug ? `@${p.profiles.profileSlug} · ` : ''}
                            {new Date(p.requested_at).toLocaleString('pt-BR')}
                        </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                        <button
                            onClick={() => review(p.id, 'approve')}
                            disabled={actingId === p.id}
                            className="w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center disabled:opacity-50"
                        >
                            {actingId === p.id ? <Spinner size={14} /> : <Check size={16} />}
                        </button>
                        <button
                            onClick={() => review(p.id, 'reject')}
                            disabled={actingId === p.id}
                            className="w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center disabled:opacity-50"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            ))}

            {reviewed.length > 0 && (
                <>
                    <p className="text-xs font-black uppercase tracking-wider mt-5" style={{ color: colors.textSecondary }}>
                        Histórico
                    </p>
                    {reviewed.map((p) => (
                        <div key={p.id} style={cardStyle} className="flex items-center justify-between gap-3 opacity-80">
                            <div className="min-w-0">
                                <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
                                    {p.profiles?.name || (p.profiles?.profileSlug ? `@${p.profiles.profileSlug}` : 'Usuário')}
                                </p>
                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                    {p.status === 'approved' ? `Aprovado · ${formatCents(p.amount_cents)}` : p.status === 'rejected' ? 'Rejeitado' : 'Consumido'}
                                </p>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    )
}

interface CodeRow {
    id: string
    code: string
    grant_type: 'days' | 'lifetime'
    days: number | null
    active: boolean
    max_uses: number
    use_count: number
    created_at: string
}

function CodesSection({ cardStyle, colors }: SectionProps) {
    const [codes, setCodes] = useState<CodeRow[]>([])
    const [loading, setLoading] = useState(true)
    const [grantType, setGrantType] = useState<'days' | 'lifetime'>('lifetime')
    const [days, setDays] = useState('30')
    const [generating, setGenerating] = useState(false)

    const [directSlug, setDirectSlug] = useState('')
    const [directGrantType, setDirectGrantType] = useState<'days' | 'lifetime'>('lifetime')
    const [directDays, setDirectDays] = useState('30')
    const [granting, setGranting] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const { codes } = await callAdminApi<{ codes: CodeRow[] }>('/api/admin/codes/list')
            setCodes(codes)
        } catch (err: any) {
            toast.error(err.message || 'Erro ao carregar códigos')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { load() }, [load])

    const generate = async () => {
        setGenerating(true)
        try {
            await callAdminApi('/api/admin/codes/create', {
                grantType,
                days: grantType === 'days' ? Number(days) : undefined,
            })
            toast.success('Código gerado!')
            await load()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao gerar código')
        } finally {
            setGenerating(false)
        }
    }

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code)
        toast.success('Código copiado!')
    }

    const grantDirect = async () => {
        if (!directSlug.trim()) return
        setGranting(true)
        try {
            await callAdminApi('/api/admin/grants/direct', {
                profileSlug: directSlug.trim(),
                grantType: directGrantType,
                days: directGrantType === 'days' ? Number(directDays) : undefined,
            })
            toast.success(`Acesso concedido a @${directSlug.trim()}!`)
            setDirectSlug('')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao conceder acesso')
        } finally {
            setGranting(false)
        }
    }

    const inputStyle: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        borderRadius: 12,
        padding: '8px 12px',
        fontSize: 13,
    }

    return (
        <div className="space-y-5">
            <div style={cardStyle} className="space-y-3">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Gerar código de liberação
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                    <select value={grantType} onChange={(e) => setGrantType(e.target.value as any)} style={inputStyle}>
                        <option value="lifetime">Vitalício</option>
                        <option value="days">Por dias</option>
                    </select>
                    {grantType === 'days' && (
                        <input
                            type="number"
                            min={1}
                            value={days}
                            onChange={(e) => setDays(e.target.value)}
                            style={{ ...inputStyle, width: 80 }}
                            placeholder="dias"
                        />
                    )}
                    <button
                        onClick={generate}
                        disabled={generating}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs text-white disabled:opacity-50"
                        style={{ background: colors.accent }}
                    >
                        {generating ? <Spinner size={14} /> : <Plus size={14} />}
                        Gerar
                    </button>
                </div>
            </div>

            <div style={cardStyle} className="space-y-3">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Conceder acesso direto (sem código)
                </p>
                <div className="flex flex-wrap gap-2 items-center">
                    <input
                        value={directSlug}
                        onChange={(e) => setDirectSlug(e.target.value)}
                        placeholder="@slug do perfil"
                        style={{ ...inputStyle, flex: 1, minWidth: 140 }}
                    />
                    <select value={directGrantType} onChange={(e) => setDirectGrantType(e.target.value as any)} style={inputStyle}>
                        <option value="lifetime">Vitalício</option>
                        <option value="days">Por dias</option>
                    </select>
                    {directGrantType === 'days' && (
                        <input
                            type="number"
                            min={1}
                            value={directDays}
                            onChange={(e) => setDirectDays(e.target.value)}
                            style={{ ...inputStyle, width: 80 }}
                            placeholder="dias"
                        />
                    )}
                    <button
                        onClick={grantDirect}
                        disabled={granting || !directSlug.trim()}
                        className="px-4 py-2 rounded-xl font-bold text-xs text-white disabled:opacity-50"
                        style={{ background: colors.accent }}
                    >
                        {granting ? <Spinner size={14} /> : 'Conceder'}
                    </button>
                </div>
            </div>

            <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Códigos gerados ({codes.length})
                </p>
                {loading ? (
                    <div className="flex justify-center py-6"><Spinner size={20} color={colors.accent} /></div>
                ) : codes.length === 0 ? (
                    <div className="text-sm" style={{ ...cardStyle, color: colors.textSecondary }}>
                        Nenhum código gerado ainda.
                    </div>
                ) : codes.map((c) => (
                    <div key={c.id} style={cardStyle} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-mono font-bold truncate" style={{ color: colors.textPrimary }}>{c.code}</p>
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                {c.grant_type === 'lifetime' ? 'Vitalício' : `${c.days} dias`} · usado {c.use_count}/{c.max_uses} {!c.active && '· inativo'}
                            </p>
                        </div>
                        <button
                            onClick={() => copyCode(c.code)}
                            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: colors.accent, color: colors.accentText }}
                        >
                            <Copy size={13} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}

function AdminsSection({ cardStyle, colors }: SectionProps) {
    const [slug, setSlug] = useState('')
    const [saving, setSaving] = useState(false)

    const setPermission = async (canGenerateCodes: boolean) => {
        if (!slug.trim()) return
        setSaving(true)
        try {
            await callAdminApi('/api/admin/permissions/set', { profileSlug: slug.trim(), canGenerateCodes })
            toast.success(canGenerateCodes ? `@${slug.trim()} agora pode gerar códigos` : `Permissão removida de @${slug.trim()}`)
            setSlug('')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao atualizar permissão')
        } finally {
            setSaving(false)
        }
    }

    const inputStyle: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        borderRadius: 12,
        padding: '8px 12px',
        fontSize: 13,
    }

    return (
        <div style={cardStyle} className="space-y-3">
            <p className="text-xs font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                Autorizar geração de códigos
            </p>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
                Quem for autorizado passa a poder gerar códigos de liberação de loja pela API — ainda sem uma tela própria.
            </p>
            <div className="flex flex-wrap gap-2">
                <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="@slug do perfil"
                    style={{ ...inputStyle, flex: 1, minWidth: 140 }}
                />
                <button
                    onClick={() => setPermission(true)}
                    disabled={saving || !slug.trim()}
                    className="px-4 py-2 rounded-xl font-bold text-xs text-white disabled:opacity-50"
                    style={{ background: '#22c55e' }}
                >
                    Autorizar
                </button>
                <button
                    onClick={() => setPermission(false)}
                    disabled={saving || !slug.trim()}
                    className="px-4 py-2 rounded-xl font-bold text-xs text-white disabled:opacity-50"
                    style={{ background: '#ef4444' }}
                >
                    Remover
                </button>
            </div>
        </div>
    )
}

interface Settings {
    price_cents: number
    validity_days: number | null
    pix_key: string | null
    pix_key_type: string | null
    pix_receiver_name: string | null
}

function SettingsSection({ cardStyle, colors }: SectionProps) {
    const [settings, setSettings] = useState<Settings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const [price, setPrice] = useState('1.00')
    const [lifetime, setLifetime] = useState(true)
    const [validityDays, setValidityDays] = useState('30')
    const [pixKey, setPixKey] = useState('')
    const [pixKeyType, setPixKeyType] = useState('cpf')
    const [pixReceiverName, setPixReceiverName] = useState('')

    useEffect(() => {
        supabase
            .from('store_access_settings')
            .select('price_cents, validity_days, pix_key, pix_key_type, pix_receiver_name')
            .eq('id', 1)
            .single()
            .then(({ data }) => {
                if (data) {
                    setSettings(data as Settings)
                    setPrice((data.price_cents / 100).toFixed(2))
                    setLifetime(!data.validity_days)
                    if (data.validity_days) setValidityDays(String(data.validity_days))
                    setPixKey(data.pix_key || '')
                    setPixKeyType(data.pix_key_type || 'cpf')
                    setPixReceiverName(data.pix_receiver_name || '')
                }
                setLoading(false)
            })
    }, [])

    const save = async () => {
        const priceCents = Math.round(Number(price.replace(',', '.')) * 100)
        if (!priceCents || priceCents <= 0) {
            toast.error('Preço inválido')
            return
        }
        setSaving(true)
        try {
            await callAdminApi('/api/admin/settings/update', {
                priceCents,
                validityDays: lifetime ? null : Number(validityDays),
                pixKey: pixKey.trim() || null,
                pixKeyType,
                pixReceiverName: pixReceiverName.trim() || null,
            })
            toast.success('Configuração salva!')
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar')
        } finally {
            setSaving(false)
        }
    }

    const inputStyle: React.CSSProperties = {
        background: colors.background,
        border: `1px solid ${colors.border}`,
        color: colors.textPrimary,
        borderRadius: 12,
        padding: '8px 12px',
        fontSize: 13,
        width: '100%',
    }

    if (loading) {
        return <div className="flex justify-center py-8"><Spinner size={24} color={colors.accent} /></div>
    }

    return (
        <div style={cardStyle} className="space-y-4">
            <div>
                <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Preço (R$)
                </label>
                <input value={price} onChange={(e) => setPrice(e.target.value)} style={inputStyle} className="mt-1" />
            </div>

            <div className="flex items-center gap-2">
                <input type="checkbox" checked={lifetime} onChange={(e) => setLifetime(e.target.checked)} id="lifetime-check" />
                <label htmlFor="lifetime-check" className="text-xs" style={{ color: colors.textPrimary }}>
                    Acesso vitalício (sem validade)
                </label>
            </div>

            {!lifetime && (
                <div>
                    <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                        Validade (dias)
                    </label>
                    <input value={validityDays} onChange={(e) => setValidityDays(e.target.value)} style={inputStyle} className="mt-1" type="number" min={1} />
                </div>
            )}

            <div>
                <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Chave PIX
                </label>
                <input value={pixKey} onChange={(e) => setPixKey(e.target.value)} style={inputStyle} className="mt-1" placeholder="CPF, e-mail, telefone ou chave aleatória" />
            </div>

            <div>
                <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Tipo da chave
                </label>
                <select value={pixKeyType} onChange={(e) => setPixKeyType(e.target.value)} style={inputStyle} className="mt-1">
                    <option value="cpf">CPF</option>
                    <option value="email">E-mail</option>
                    <option value="phone">Telefone</option>
                    <option value="random">Aleatória</option>
                </select>
            </div>

            <div>
                <label className="text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                    Nome do recebedor (mostrado a quem paga)
                </label>
                <input value={pixReceiverName} onChange={(e) => setPixReceiverName(e.target.value)} style={inputStyle} className="mt-1" />
            </div>

            <button
                onClick={save}
                disabled={saving}
                className="w-full py-3 rounded-xl font-black uppercase text-xs text-white disabled:opacity-50"
                style={{ background: colors.accent }}
            >
                {saving ? <Spinner size={14} /> : 'Salvar configurações'}
            </button>
        </div>
    )
}
