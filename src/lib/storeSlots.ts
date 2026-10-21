// src/lib/storeSlots.ts
//
// Horários de atendimento de uma loja: a partir da configuração de dias/horas (stores.opening_hours) e dos horários já ocupados
// (get_store_busy_slots), diz quais começos de atendimento estão livres ou ocupados em cada dia. Função pura (sem React/banco).
// É a mesma conta do agendador (StoreSchedule): intervalo entre horários, almoço, dias fechados/bloqueados, "hoje só depois de agora"
// e conflito por sobreposição considerando a duração do serviço.

export interface DayConfig { isOpen?: boolean; start?: string; end?: string; lunchStart?: string; lunchEnd?: string }
export interface OpeningConfig {
    is_active?: boolean
    slot_interval?: number
    weekly?: Record<string, DayConfig>
    blocked_dates?: string[]
}
/** Um horário já tomado: data (AAAA-MM-DD), hora (HH:MM[:SS]) e duração em minutos */
export interface BusySlot { date: string; time: string; duration: number }
export interface DaySlot { time: string; status: 'free' | 'occupied' }

// O mesmo padrão do agendador quando a loja ainda não definiu horários
export const DEFAULT_OPENING: OpeningConfig = {
    is_active: true,
    slot_interval: 60,
    weekly: {
        '1': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '2': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '3': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '4': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '5': { isOpen: true, start: '08:00', end: '18:00', lunchStart: '12:00', lunchEnd: '13:00' },
        '6': { isOpen: false, start: '09:00', end: '13:00' },
        '0': { isOpen: false, start: '09:00', end: '13:00' },
    },
    blocked_dates: [],
}

export const toMinutes = (t: string): number => {
    const [h, m] = (t || '0:0').split(':')
    return (Number(h) || 0) * 60 + (Number(m) || 0)
}
export const fromMinutes = (n: number): string => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
/** AAAA-MM-DD no fuso do aparelho (toISOString viraria o dia depois das 20 h no Brasil) */
export const dateKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Os começos de atendimento do dia, cada um livre ou ocupado para um serviço de `durationMin` minutos. Dia fechado = []. */
export function daySlots(cfg: OpeningConfig | null | undefined, date: Date, durationMin: number, busy: BusySlot[], now: Date = new Date()): DaySlot[] {
    const c = cfg || DEFAULT_OPENING
    if (c.is_active === false) return []
    const key = dateKey(date)
    if (c.blocked_dates && c.blocked_dates.includes(key)) return []
    const day = c.weekly?.[String(date.getDay())]
    if (!day || !day.isOpen) return []

    const interval = c.slot_interval || 30
    const start = toMinutes(day.start || '08:00')
    const end = toMinutes(day.end || '18:00')
    const lunchStart = day.lunchStart ? toMinutes(day.lunchStart) : null
    const lunchEnd = day.lunchEnd ? toMinutes(day.lunchEnd) : null
    const isToday = dateKey(now) === key
    const nowMin = now.getHours() * 60 + now.getMinutes()
    const dayBusy = busy.filter((b) => b.date === key)

    const out: DaySlot[] = []
    for (let m = start; m + durationMin <= end; m += interval) {
        if (lunchStart !== null && lunchEnd !== null) {
            const slotEnd = m + durationMin
            if ((m >= lunchStart && m < lunchEnd) || (slotEnd > lunchStart && slotEnd <= lunchEnd)) continue
        }
        if (isToday && m <= nowMin) continue
        const taken = dayBusy.some((b) => {
            const s = toMinutes(b.time)
            return m < s + (b.duration || 60) && s < m + durationMin
        })
        out.push({ time: fromMinutes(m), status: taken ? 'occupied' : 'free' })
    }
    return out
}

export const freeCount = (slots: DaySlot[]): number => slots.filter((s) => s.status === 'free').length
