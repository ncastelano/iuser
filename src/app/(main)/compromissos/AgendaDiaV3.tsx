'use client'

// A AGENDA DA LOJA na 3.0 — UM DIA POR VEZ numa linha do tempo (desenho do laboratório /painel-teste): do abrir ao fechar, cada
// agendamento no horário dele (cor do estado na lateral) e os BURACOS LIVRES à mostra ("livre · 1h30"), o almoço como pausa.
// Tocar num agendamento abre, ali mesmo, o cartão de sempre (com as ações: entrada, serviço feito, conversar, cancelar...).
// A regra do dia é pura e testada em src/lib/agendaTimeline.ts.
import { useEffect, useState, type ReactNode } from 'react'
import { Coffee, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { dayTimeline, duracao } from '@/lib/agendaTimeline'
import type { OpeningConfig } from '@/lib/storeSlots'
import type { Appointment } from './dadosDoCompromisso'

const COR: Record<string, string> = { pending: '#f59e0b', confirmed: '#8b5cf6', completed: '#3b82f6', cancelled: '#ef4444' }
const ROT: Record<string, string> = { pending: 'Pendente', confirmed: 'Confirmado', completed: 'Feito', cancelled: 'Cancelado' }

export default function AgendaDiaV3({ storeId, date, appts, renderCard, onNovo }: {
    storeId: string; date: Date; appts: Appointment[]; renderCard: (a: Appointment) => ReactNode; onNovo?: () => void
}) {
    const { colors: c } = useTheme()
    const [cfg, setCfg] = useState<OpeningConfig | null | undefined>(undefined)
    const [aberto, setAberto] = useState<string | null>(null)
    useEffect(() => {
        let vivo = true
        supabase.from('stores').select('opening_hours').eq('id', storeId).maybeSingle().then(({ data }) => { if (vivo) setCfg((data as any)?.opening_hours || null) })
        return () => { vivo = false }
    }, [storeId])
    useEffect(() => setAberto(null), [date])

    const ativos = appts.filter((a) => a.status !== 'cancelled')
    const t = dayTimeline(cfg, date, ativos.map((a) => ({ ...a, duration: a.duration_minutes || 60 })))
    const livre = t.segments.filter((s) => s.kind === 'free').reduce((n, s) => n + (s.kind === 'free' ? s.minutes : 0), 0)

    if (cfg === undefined) return <div className="rounded-3xl h-40 animate-pulse" style={{ background: `${c.border}30` }} />
    return (
        <section>
            <div className="flex items-baseline justify-between mb-2">
                <p className="text-[13px] font-black" style={{ color: c.textPrimary }}>{t.open ? `Aberto ${t.start}–${t.end}` : ativos.length ? 'Dia fechado (com agendamento)' : 'Fechado neste dia'}</p>
                {t.open && <p className="text-[12px] font-bold" style={{ color: c.textSecondary }}>{ativos.length} {ativos.length === 1 ? 'agendamento' : 'agendamentos'} · {duracao(livre)} livre</p>}
            </div>
            {t.segments.length === 0 ? (
                <div className="rounded-3xl p-6 text-center text-[13px]" style={{ border: `1.5px dashed ${c.border}`, color: c.textSecondary }}>Nada marcado e a loja não abre neste dia.</div>
            ) : (
                <div className="relative pl-14">
                    <span className="absolute left-[46px] top-2 bottom-2 w-px" style={{ background: c.border }} />
                    {t.segments.map((s, i) => (
                        <div key={`${s.kind}-${s.from}-${i}`} className="relative mb-2">
                            <span className="absolute -left-14 top-2 w-11 text-right text-[11px] font-black" style={{ color: c.textSecondary }}>{s.from}</span>
                            {s.kind === 'free' && (
                                <button onClick={onNovo} disabled={!onNovo} className="w-full rounded-2xl px-3 flex items-center justify-between text-left" style={{ minHeight: Math.min(64, 26 + s.minutes / 6), border: `1.5px dashed #22c55e66`, background: '#22c55e0d' }}>
                                    <span className="text-[12px] font-black" style={{ color: '#15803d' }}>livre · {duracao(s.minutes)}</span>
                                    <span className="text-[11px] font-bold" style={{ color: '#15803d' }}>{s.from}–{s.to}{onNovo ? <Plus size={12} className="inline ml-1" /> : null}</span>
                                </button>
                            )}
                            {s.kind === 'lunch' && (
                                <div className="rounded-2xl px-3 h-8 flex items-center gap-1.5 text-[11.5px] font-bold" style={{ background: `${c.border}40`, color: c.textSecondary }}><Coffee size={13} />Pausa {s.from}–{s.to}</div>
                            )}
                            {s.kind === 'appt' && s.appts.map((a) => {
                                const cor = COR[a.status] || '#8b5cf6'
                                const quem = a.customer_slug ? `@${a.customer_slug}` : 'Cliente'
                                const fim = (() => { const [h, m] = a.time.split(':').map(Number); const t2 = h * 60 + m + (a.duration_minutes || 60); return `${String(Math.floor(t2 / 60)).padStart(2, '0')}:${String(t2 % 60).padStart(2, '0')}` })()
                                return (
                                    <div key={a.id} className="mb-1.5">
                                        <button onClick={() => setAberto(aberto === a.id ? null : a.id)} className="w-full rounded-2xl overflow-hidden flex text-left active:scale-[.99] transition" style={{ background: c.surface, border: `1px solid ${aberto === a.id ? cor : c.border}` }}>
                                            <span className="w-1.5 flex-shrink-0" style={{ background: cor }} />
                                            <span className="flex-1 min-w-0 px-3 py-2.5">
                                                <span className="flex items-center gap-2"><span className="text-[13.5px] font-black truncate" style={{ color: c.textPrimary }}>{a.service_name || 'Atendimento'}</span><span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: `${cor}22`, color: cor }}>{ROT[a.status] || a.status}</span></span>
                                                <span className="block text-[11.5px] mt-0.5" style={{ color: c.textSecondary }}>{a.time.slice(0, 5)}–{fim} · {quem}{a.people_count > 1 ? ` · ${a.people_count} pessoas` : ''}{a.deposit_status === 'reported' ? ' · entrada informada' : a.deposit_status === 'paid' ? ' · entrada paga' : ''}</span>
                                            </span>
                                        </button>
                                        {aberto === a.id && <div className="mt-2">{renderCard(a)}</div>}
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                    <span className="absolute -left-14 -bottom-1 w-11 text-right text-[11px] font-black" style={{ color: c.textSecondary }}>{t.end}</span>
                </div>
            )}
        </section>
    )
}
