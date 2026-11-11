// A LINHA DO TEMPO de UM dia da agenda da loja (3.0, desenho do laboratório /painel-teste): do horário de abrir ao de fechar, os
// agendamentos (no horário deles) e os BURACOS LIVRES entre eles, à mostra; o almoço aparece como pausa. Puro e testado
// (npm run test:agenda-timeline). Usa a mesma configuração do agendador (stores.opening_hours, src/lib/storeSlots.ts).
import { DEFAULT_OPENING, dateKey, fromMinutes, toMinutes, type OpeningConfig } from './storeSlots.ts'

export interface TimelineAppt { id: string; time: string; duration?: number | null }
export type Segment<A extends TimelineAppt> =
    | { kind: 'appt'; from: string; to: string; appts: A[] }
    | { kind: 'free'; from: string; to: string; minutes: number }
    | { kind: 'lunch'; from: string; to: string }

/** o dia: aberto? início/fim e os segmentos em ordem. Agendamento fora do horário entra mesmo assim (e estica o dia). */
export function dayTimeline<A extends TimelineAppt>(cfg: OpeningConfig | null | undefined, date: Date, appts: A[]): { open: boolean; start: string | null; end: string | null; segments: Segment<A>[] } {
    const c = cfg || DEFAULT_OPENING
    const day = c.weekly?.[String(date.getDay())]
    const blocked = !!c.blocked_dates?.includes(dateKey(date))
    const open = c.is_active !== false && !blocked && !!day?.isOpen
    const ord = [...appts].sort((a, b) => toMinutes(a.time) - toMinutes(b.time))
    if (!open && ord.length === 0) return { open: false, start: null, end: null, segments: [] }

    let start = open ? toMinutes(day!.start || '08:00') : toMinutes(ord[0].time)
    let end = open ? toMinutes(day!.end || '18:00') : 0
    for (const a of ord) { start = Math.min(start, toMinutes(a.time)); end = Math.max(end, toMinutes(a.time) + (a.duration || 60)) }
    if (end <= start) end = start + 60
    const lunch = open && day?.lunchStart && day?.lunchEnd ? [toMinutes(day.lunchStart), toMinutes(day.lunchEnd)] as const : null

    // junta agendamentos que se sobrepõem num bloco só
    const blocks: { s: number; e: number; appts: A[] }[] = []
    for (const a of ord) {
        const s = toMinutes(a.time), e = s + (a.duration || 60)
        const last = blocks[blocks.length - 1]
        if (last && s < last.e) { last.e = Math.max(last.e, e); last.appts.push(a) } else blocks.push({ s, e, appts: [a] })
    }

    const segs: Segment<A>[] = []
    const free = (s: number, e: number) => {
        if (e <= s) return
        // o almoço corta o buraco livre
        if (lunch && s < lunch[1] && lunch[0] < e) {
            if (lunch[0] > s) segs.push({ kind: 'free', from: fromMinutes(s), to: fromMinutes(lunch[0]), minutes: lunch[0] - s })
            segs.push({ kind: 'lunch', from: fromMinutes(Math.max(s, lunch[0])), to: fromMinutes(Math.min(e, lunch[1])) })
            if (e > lunch[1]) segs.push({ kind: 'free', from: fromMinutes(lunch[1]), to: fromMinutes(e), minutes: e - lunch[1] })
            return
        }
        segs.push({ kind: 'free', from: fromMinutes(s), to: fromMinutes(e), minutes: e - s })
    }
    let cur = start
    for (const b of blocks) {
        free(cur, b.s)
        segs.push({ kind: 'appt', from: fromMinutes(b.s), to: fromMinutes(b.e), appts: b.appts })
        cur = Math.max(cur, b.e)
    }
    free(cur, end)
    return { open, start: fromMinutes(start), end: fromMinutes(end), segments: segs }
}

export const duracao = (min: number) => (min < 60 ? `${min} min` : min % 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min / 60}h`)
