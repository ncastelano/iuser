// src/components/ProfileScheduleModal.tsx
//
// Agendar um horário na agenda de um perfil (quem atende como pessoa, sem loja).
// Os horários vêm da disponibilidade que o próprio perfil configurou em
// Compromissos (profiles.working_hours) e os já ocupados vêm de uma função do
// banco que só devolve data/hora/duração, sem mostrar quem marcou.
'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { X, Calendar, Clock, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Spinner } from '@/components/Spinner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const DAYS_AHEAD = 21
const DURATIONS = [30, 60, 90, 120]
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Mesma agenda padrão usada quando o perfil ainda não configurou a disponibilidade.
const DEFAULT_HOURS = {
    is_active: true,
    slot_interval: 60,
    weekly: {
        '1': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '2': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '3': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '4': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '5': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '6': { isOpen: false, start: '09:00', end: '13:00', lunchStart: '', lunchEnd: '' },
        '0': { isOpen: false, start: '09:00', end: '13:00', lunchStart: '', lunchEnd: '' },
    },
    blocked_dates: [] as string[],
}

interface Props {
    profileId: string
    profileName: string
    profileSlug: string
    onClose: () => void
}

const toMin = (t: string) => {
    const [h, m] = (t || '0:0').split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
}
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const localDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function ProfileScheduleModal({ profileId, profileName, profileSlug, onClose }: Props) {
    const router = useRouter()
    const { userId } = useProfile()
    const [hours, setHours] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState<{ slot_date: string; slot_time: string; duration_minutes: number }[]>([])
    const [duration, setDuration] = useState(60)
    const [dateStr, setDateStr] = useState<string | null>(null)
    const [time, setTime] = useState<string | null>(null)
    const [note, setNote] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [done, setDone] = useState(false)

    const load = async () => {
        const from = localDateStr(new Date())
        const to = localDateStr(new Date(Date.now() + DAYS_AHEAD * 86400000))
        const [{ data: prof }, { data: slots }] = await Promise.all([
            supabase.from('profiles').select('working_hours').eq('id', profileId).maybeSingle(),
            supabase.rpc('get_profile_busy_slots', { p_profile_id: profileId, p_from: from, p_to: to }),
        ])
        setHours(prof?.working_hours || DEFAULT_HOURS)
        setBusy((slots || []) as any)
        setLoading(false)
    }
    useEffect(() => { load() }, [profileId])

    const cfg = hours || DEFAULT_HOURS
    const interval = Number(cfg.slot_interval) || 60

    // Horários livres de um dia, considerando expediente, almoço, dias bloqueados e ocupados.
    const slotsFor = (day: Date): string[] => {
        if (cfg.is_active === false) return []
        const ds = localDateStr(day)
        if ((cfg.blocked_dates || []).includes(ds)) return []
        const dc = cfg.weekly?.[String(day.getDay())]
        if (!dc || !dc.isOpen) return []
        const start = toMin(dc.start || '08:00')
        const end = toMin(dc.end || '18:00')
        const lStart = dc.lunchStart ? toMin(dc.lunchStart) : null
        const lEnd = dc.lunchEnd ? toMin(dc.lunchEnd) : null
        const now = new Date()
        const isToday = ds === localDateStr(now)
        const nowMin = now.getHours() * 60 + now.getMinutes()
        const dayBusy = busy.filter((b) => b.slot_date === ds)
        const out: string[] = []
        for (let m = start; m + duration <= end; m += interval) {
            const slotEnd = m + duration
            if (lStart !== null && lEnd !== null && m < lEnd && slotEnd > lStart) continue
            if (isToday && m <= nowMin) continue
            const clash = dayBusy.some((b) => {
                const bs = toMin(b.slot_time.slice(0, 5))
                return m < bs + (b.duration_minutes || 60) && bs < slotEnd
            })
            if (!clash) out.push(fromMin(m))
        }
        return out
    }

    const days = useMemo(() => {
        const list: { date: Date; ds: string; free: number }[] = []
        for (let i = 0; i < DAYS_AHEAD; i++) {
            const d = new Date()
            d.setHours(0, 0, 0, 0)
            d.setDate(d.getDate() + i)
            const free = slotsFor(d).length
            if (free > 0) list.push({ date: d, ds: localDateStr(d), free })
        }
        return list
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hours, busy, duration])

    const slots = useMemo(() => {
        if (!dateStr) return []
        const [y, m, d] = dateStr.split('-').map(Number)
        return slotsFor(new Date(y, m - 1, d))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dateStr, hours, busy, duration])

    // Trocar a duração pode invalidar o horário escolhido.
    useEffect(() => { if (time && !slots.includes(time)) setTime(null) }, [slots, time])

    const handleConfirm = async () => {
        if (!userId) {
            router.push('/login')
            return
        }
        if (userId === profileId) {
            toast.error('Você não pode agendar na sua própria agenda.')
            return
        }
        if (!dateStr || !time) return
        setSubmitting(true)
        const { data: me } = await supabase.from('profiles').select('profileSlug, avatar_url').eq('id', userId).maybeSingle()
        const { data: inserted, error } = await supabase
            .from('appointments')
            .insert({
                store_id: null,
                store_slug: '',
                store_name: '',
                store_logo_url: '',
                provider_profile_id: profileId,
                owner_id: profileId,
                owner_slug: profileSlug,
                customer_id: userId,
                customer_slug: me?.profileSlug || '',
                customer_avatar_url: me?.avatar_url || '',
                date: dateStr,
                time,
                duration_minutes: duration,
                service_name: note.trim() || 'Atendimento',
                service_type: 'service',
                people_count: 1,
                status: 'pending',
                direction: 'outgoing',
                is_public: false,
            })
            .select('id')
            .single()
        setSubmitting(false)
        if (error) {
            toast.error(error.message)
            load() // horário pode ter acabado de ser ocupado
            return
        }
        // Avisa o perfil por push (melhor esforço).
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session || !inserted) return
            fetch('/api/push/send-appointment-invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ appointmentId: inserted.id }),
            }).catch(() => {})
        })
        setDone(true)
    }

    const fmtDay = (d: Date) => `${WEEKDAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

    if (typeof document === 'undefined') return null

    // Portal no <body>: a página do perfil tem elementos com blur/transform que
    // prendem o "fixed" dentro deles e o modal não cobria a tela.
    return createPortal(
        <div className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div
                className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 space-y-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: GRADIENT }}>
                        <Calendar size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-base font-black text-gray-900">Agendar com {profileName}</h3>
                        <p className="text-xs text-gray-500">O horário fica pendente até {profileName} aceitar.</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full text-gray-500"><X size={20} /></button>
                </div>

                {done ? (
                    <div className="py-6 text-center space-y-3">
                        <CheckCircle2 size={44} className="mx-auto text-green-500" />
                        <p className="text-sm font-black text-gray-900">Pedido de agendamento enviado!</p>
                        <p className="text-xs text-gray-500">{dateStr && fmtDay(new Date(dateStr + 'T00:00:00'))} às {time}. Você acompanha em Compromissos.</p>
                        <button onClick={onClose} className="px-6 py-2.5 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>Fechar</button>
                    </div>
                ) : loading ? (
                    <div className="flex justify-center py-10"><Spinner size={24} color="#f97316" /></div>
                ) : (
                    <>
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1.5">Duração</p>
                            <div className="flex gap-2">
                                {DURATIONS.map((d) => (
                                    <button
                                        key={d}
                                        onClick={() => setDuration(d)}
                                        className="flex-1 py-2 rounded-xl text-xs font-black border-2 transition"
                                        style={duration === d ? { background: GRADIENT, color: '#fff', borderColor: 'transparent' } : { borderColor: '#e5e7eb', color: '#6b7280' }}
                                    >
                                        {d >= 60 ? `${d / 60}h${d % 60 ? '30' : ''}` : `${d} min`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1.5">Dia</p>
                            {days.length === 0 ? (
                                <p className="text-xs text-gray-500 py-3">Sem horários livres nos próximos {DAYS_AHEAD} dias para essa duração.</p>
                            ) : (
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                    {days.map(({ date, ds, free }) => (
                                        <button
                                            key={ds}
                                            onClick={() => { setDateStr(ds); setTime(null) }}
                                            className="flex-shrink-0 px-3 py-2 rounded-xl text-center border-2 transition"
                                            style={dateStr === ds ? { background: GRADIENT, color: '#fff', borderColor: 'transparent' } : { borderColor: '#e5e7eb', color: '#374151' }}
                                        >
                                            <p className="text-xs font-black">{fmtDay(date)}</p>
                                            <p className="text-[10px] opacity-80">{free} vaga{free !== 1 ? 's' : ''}</p>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {dateStr && (
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1"><Clock size={12} /> Horário</p>
                                <div className="grid grid-cols-4 gap-2">
                                    {slots.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => setTime(s)}
                                            className="py-2 rounded-xl text-xs font-black border-2 transition"
                                            style={time === s ? { background: GRADIENT, color: '#fff', borderColor: 'transparent' } : { borderColor: '#e5e7eb', color: '#374151' }}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div>
                            <p className="text-[11px] font-black uppercase tracking-wider text-gray-500 mb-1.5">O que você precisa? (opcional)</p>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                placeholder="Ex: Consulta, aula, reunião..."
                                rows={2}
                                className="w-full p-3 rounded-xl border-2 border-gray-200 text-sm text-gray-900 focus:outline-none focus:border-orange-400 resize-none"
                            />
                        </div>

                        {!userId && <p className="text-xs text-center text-gray-500">Você precisa entrar na sua conta para agendar.</p>}

                        <button
                            onClick={handleConfirm}
                            disabled={submitting || (!!userId && (!dateStr || !time))}
                            className="w-full py-3 rounded-2xl text-sm font-black text-white disabled:opacity-50"
                            style={{ background: GRADIENT, boxShadow: '0 6px 16px #f9731650' }}
                        >
                            {submitting ? 'Enviando...' : !userId ? 'Entrar para agendar' : time ? `Pedir ${time} · ${dateStr!.split('-').reverse().slice(0, 2).join('/')}` : 'Escolha dia e horário'}
                        </button>
                    </>
                )}
            </div>
        </div>,
        document.body
    )
}
