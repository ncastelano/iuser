// src/components/AdminDashboard/ManualSection.tsx
//
// Admin → Manual: o manual de regras do iUser, só do administrador geral. Esta tela é a PORTA do cofre (a regra mora no servidor, ver lib/adminVault.ts):
//   fechado   → "Desbloquear com digital/rosto" (passkey de um aparelho já cadastrado);
//   sem nada  → cadastrar ESTE aparelho (o primeiro entra direto; os outros esperam a aprovação, com a digital, de um aparelho já cadastrado);
//   aberto    → a leitura (ManualReader), a lista de aparelhos (revogar) e os pedidos de aparelho novo (aprovar/negar). A sessão dura 15 minutos sem uso.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { Fingerprint, Laptop, Lock, ShieldCheck, Smartphone, Trash2, Unlock } from 'lucide-react'
import { callAdminApi } from '@/lib/callAdminApi'
import { supabase } from '@/lib/supabase/client'
import { Spinner } from '@/components/Spinner'
import { toast } from '@/lib/toast'
import type { ThemeColors } from '@/app/contexts/theme'
import ManualReader from './ManualReader'

type Phase = 'loading' | 'unconfigured' | 'empty' | 'locked' | 'open'
interface Device { id: string; label: string; user_agent: string | null; created_at: string; last_used_at: string | null; revoked_at: string | null }
interface Pending { id: string; label: string; userAgent: string | null; createdAt: string }

const API = '/api/admin/manual/device'
const IDLE_MS = 15 * 60_000
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const uaLabel = (ua: string | null) => {
    if (!ua) return 'aparelho'
    const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'aparelho'
    const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
    return br ? `${os} · ${br}` : os
}
const isPhone = (ua: string | null) => !!ua && /iPhone|Android/.test(ua)

export default function ManualSection({ cardStyle, colors }: { cardStyle: React.CSSProperties; colors: ThemeColors }) {
    const [phase, setPhase] = useState<Phase>('loading')
    const [busy, setBusy] = useState(false)
    const [label, setLabel] = useState('')
    const [waiting, setWaiting] = useState<string | null>(null)   // pedido de aparelho novo esperando aprovação (id)
    const [email, setEmail] = useState('')
    const [deviceName, setDeviceName] = useState('')
    const [devices, setDevices] = useState<Device[]>([])
    const [current, setCurrent] = useState('')
    const [pending, setPending] = useState<Pending[]>([])
    const [supported, setSupported] = useState(true)
    const lastActivity = useRef(Date.now())
    const touch = useCallback(() => { lastActivity.current = Date.now() }, [])

    const status = useCallback(async () => {
        try {
            const s = await callAdminApi<{ configured: boolean; hasDevices: boolean; unlocked: boolean }>(API, { action: 'status' })
            setPhase(!s.configured ? 'unconfigured' : s.unlocked ? 'open' : s.hasDevices ? 'locked' : 'empty')
        } catch (e: any) { toast.error(e.message); setPhase('unconfigured') }
    }, [])
    useEffect(() => { setSupported(browserSupportsWebAuthn()); status(); supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || '')) }, [status])

    const loadDevices = useCallback(async () => {
        try {
            const [l, p] = await Promise.all([callAdminApi<{ current: string; devices: Device[] }>(API, { action: 'list' }), callAdminApi<{ pending: Pending[] }>(API, { action: 'pending' })])
            setDevices(l.devices); setCurrent(l.current); setPending(p.pending)
        } catch { setPhase('locked') }
    }, [])
    useEffect(() => { if (phase === 'open') loadDevices() }, [phase, loadDevices])
    // pedidos de aparelho novo: olha de tempos em tempos enquanto está aberto
    useEffect(() => {
        if (phase !== 'open') return
        const t = setInterval(() => { callAdminApi<{ pending: Pending[] }>(API, { action: 'pending' }).then((p) => setPending(p.pending)).catch(() => {}) }, 8000)
        return () => clearInterval(t)
    }, [phase])
    // a sessão cai sozinha depois de 15 min sem uso (o servidor também expira)
    useEffect(() => {
        if (phase !== 'open') return
        const t = setInterval(() => { if (Date.now() - lastActivity.current > IDLE_MS) { callAdminApi(API, { action: 'lock' }).catch(() => {}); setPhase('locked'); toast.info('Manual bloqueado por inatividade.') } }, 15_000)
        return () => clearInterval(t)
    }, [phase])
    const fail = (e: any) => {
        const m = String(e?.message || e)
        toast.error(/NotAllowed|cancel|timed out|abort/i.test(m) ? 'Confirmação cancelada ou não reconhecida neste aparelho.' : m)
    }

    const unlock = async () => {
        setBusy(true)
        try {
            const o = await callAdminApi<{ options: any; challengeId: string }>(API, { action: 'unlock-options' })
            const response = await startAuthentication({ optionsJSON: o.options })
            const r = await callAdminApi<{ device: string }>(API, { action: 'unlock-verify', challengeId: o.challengeId, response })
            setDeviceName(r.device); touch(); setPhase('open')
        } catch (e) { fail(e) } finally { setBusy(false) }
    }

    /** Cadastra ESTE aparelho: direto se for o primeiro; senão espera a aprovação de um aparelho já cadastrado */
    const enroll = async () => {
        if (!label.trim()) { toast.error('Dê um nome ao aparelho (ex.: Notebook, Celular).'); return }
        setBusy(true)
        try {
            const st = await callAdminApi<{ requestId: string; needsApproval: boolean }>(API, { action: 'enroll-start', label })
            if (st.needsApproval) {
                setWaiting(st.requestId)
                toast.info('Pedido enviado. Aprove em um aparelho já cadastrado.')
                for (let i = 0; i < 200; i++) {                       // ~10 min
                    await new Promise((r) => setTimeout(r, 3000))
                    const s = await callAdminApi<{ approved: boolean }>(API, { action: 'enroll-status', requestId: st.requestId })
                    if (s.approved) break
                    if (i === 199) throw new Error('O pedido expirou. Comece de novo.')
                }
            }
            const o = await callAdminApi<{ options: any; challengeId: string }>(API, { action: 'enroll-options', requestId: st.requestId })
            const response = await startRegistration({ optionsJSON: o.options })
            const r = await callAdminApi<{ device: string }>(API, { action: 'enroll-verify', challengeId: o.challengeId, response })
            setDeviceName(r.device); setLabel(''); touch(); setPhase('open'); toast.success('Aparelho cadastrado.')
        } catch (e) { fail(e) } finally { setBusy(false); setWaiting(null) }
    }

    const approve = async (id: string) => {
        setBusy(true)
        try {
            const o = await callAdminApi<{ options: any; challengeId: string }>(API, { action: 'approve-options', requestId: id })
            const response = await startAuthentication({ optionsJSON: o.options })
            await callAdminApi(API, { action: 'approve-verify', challengeId: o.challengeId, response })
            toast.success('Aparelho aprovado. Ele já pode terminar o cadastro.'); loadDevices()
        } catch (e) { fail(e) } finally { setBusy(false) }
    }
    const deny = async (id: string) => { await callAdminApi(API, { action: 'deny', requestId: id }).catch(() => {}); loadDevices() }
    const revoke = async (d: Device) => {
        if (!confirm(`Revogar "${d.label}"? Esse aparelho perde o acesso ao manual.`)) return
        try {
            const r = await callAdminApi<{ self: boolean }>(API, { action: 'revoke', id: d.id })
            if (r.self) { setPhase('locked'); status() } else loadDevices()
        } catch (e) { fail(e) }
    }
    const lock = async () => { await callAdminApi(API, { action: 'lock' }).catch(() => {}); setPhase('locked'); status() }

    const title = <h2 className="text-lg font-black flex items-center gap-2" style={{ color: colors.textPrimary }}><ShieldCheck size={18} style={{ color: colors.accent }} /> Manual de regras</h2>
    const btn = (primary = true): React.CSSProperties => primary ? { background: colors.accent, color: colors.accentText } : { background: `${colors.border}45`, color: colors.textPrimary }

    if (phase === 'loading') return <div className="flex justify-center py-12"><Spinner size={28} color={colors.accent} /></div>

    if (phase === 'unconfigured') return (
        <div style={cardStyle} className="space-y-2">
            {title}
            <p className="text-[13px]" style={{ color: colors.textSecondary }}>O cofre do manual não está configurado neste endereço. Ele precisa do segredo do servidor (<code>MANUAL_SECRET</code>) e da lista de endereços permitidos (<code>MANUAL_ORIGINS</code>). Enquanto isso, ele fica fechado.</p>
        </div>
    )

    if (phase === 'empty' || phase === 'locked') return (
        <div style={cardStyle} className="space-y-4">
            {title}
            <p className="text-[13px]" style={{ color: colors.textSecondary }}>
                Só você lê este manual, e só em um aparelho seu cadastrado, confirmando com a digital, o rosto ou o PIN do aparelho. O texto não fica no código do app nem no seu aparelho: o servidor entrega um capítulo por vez e a sessão fecha sozinha em 15 minutos.
            </p>
            {!supported && <p className="text-[12px] font-bold" style={{ color: '#ef4444' }}>Este navegador não tem suporte à digital/rosto (passkey). Use outro navegador ou aparelho.</p>}

            {phase === 'locked' && (
                <button onClick={unlock} disabled={busy || !supported} className="w-full h-12 rounded-full text-sm font-black flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50" style={btn()}>
                    {busy && !waiting ? <Spinner size={16} color={colors.accentText} /> : <Fingerprint size={18} />} Desbloquear com digital ou rosto
                </button>
            )}

            <div className="rounded-2xl p-3 space-y-2" style={{ background: `${colors.border}25`, border: `1px solid ${colors.border}` }}>
                <p className="text-[12px] font-black" style={{ color: colors.textPrimary }}>{phase === 'empty' ? 'Cadastrar o primeiro aparelho' : 'Este aparelho é novo?'}</p>
                <p className="text-[12px]" style={{ color: colors.textSecondary }}>
                    {phase === 'empty' ? 'Nenhum aparelho cadastrado ainda: o primeiro entra direto, já logado com o seu e-mail. Cadastre agora o que você está usando.' : 'Peça o cadastro aqui. Ele só termina depois que você aprovar, com a digital, em um aparelho que já está cadastrado.'}
                </p>
                <div className="flex gap-2">
                    <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Nome do aparelho (ex.: Notebook)" className="flex-1 h-10 rounded-full px-4 text-[13px] focus:outline-none" style={{ background: `${colors.border}40`, color: colors.textPrimary }} />
                    <button onClick={enroll} disabled={busy || !supported} className="h-10 px-4 rounded-full text-[12px] font-black transition active:scale-95 disabled:opacity-50" style={btn(phase === 'empty')}>{waiting ? 'Aguardando aprovação…' : 'Cadastrar'}</button>
                </div>
                {waiting && <p className="text-[12px] font-bold" style={{ color: '#d97706' }}>Aguardando a aprovação em outro aparelho seu cadastrado (Admin → Manual → Aparelhos).</p>}
            </div>
        </div>
    )

    return (
        <div className="space-y-4">
            <div style={cardStyle} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                    {title}
                    <button onClick={lock} className="h-8 px-3 rounded-full text-[12px] font-black flex items-center gap-1.5 transition active:scale-95" style={btn(false)}><Lock size={13} /> Bloquear</button>
                </div>
                {pending.length > 0 && (
                    <div className="space-y-2">
                        {pending.map((p) => (
                            <div key={p.id} className="rounded-2xl p-3 flex items-center gap-3" style={{ background: '#d9770614', border: '1px solid #d9770640' }}>
                                <Smartphone size={18} style={{ color: '#d97706' }} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>Novo aparelho pedindo acesso: {p.label}</p>
                                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>{uaLabel(p.userAgent)} · {fmt(p.createdAt)} — só aprove se foi você.</p>
                                </div>
                                <button onClick={() => approve(p.id)} disabled={busy} className="h-8 px-3 rounded-full text-[12px] font-black flex items-center gap-1 transition active:scale-95 disabled:opacity-50" style={btn()}><Fingerprint size={13} /> Aprovar</button>
                                <button onClick={() => deny(p.id)} className="h-8 px-3 rounded-full text-[12px] font-black transition active:scale-95" style={btn(false)}>Negar</button>
                            </div>
                        ))}
                    </div>
                )}
                <ManualReader colors={colors} who={`${email} · ${deviceName || devices.find((d) => d.id === current)?.label || 'aparelho'}`} onActivity={touch} />
            </div>

            <div style={cardStyle} className="space-y-2">
                <h3 className="text-sm font-black flex items-center gap-2" style={{ color: colors.textPrimary }}><Unlock size={15} style={{ color: colors.accent }} /> Aparelhos</h3>
                {devices.filter((d) => !d.revoked_at).map((d) => (
                    <div key={d.id} className="flex items-center gap-3 rounded-2xl px-3 py-2" style={{ background: `${colors.border}25` }}>
                        {isPhone(d.user_agent) ? <Smartphone size={16} style={{ color: colors.textSecondary }} /> : <Laptop size={16} style={{ color: colors.textSecondary }} />}
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{d.label}{d.id === current && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: '#16a34a1f', color: '#16a34a' }}>este aparelho</span>}</p>
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>{uaLabel(d.user_agent)} · cadastrado {fmt(d.created_at)} · último uso {fmt(d.last_used_at)}</p>
                        </div>
                        <button onClick={() => revoke(d)} aria-label={`Revogar ${d.label}`} className="w-8 h-8 rounded-full flex items-center justify-center transition active:scale-90" style={btn(false)}><Trash2 size={14} /></button>
                    </div>
                ))}
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>Para cadastrar mais um aparelho, abra o painel nele, vá em Admin → Manual e peça o cadastro; depois aprove aqui. Se perder todos os aparelhos, a recuperação é por dentro do Supabase (apagar a linha em <code>admin_trusted_devices</code>).</p>
            </div>
        </div>
    )
}
