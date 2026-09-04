// lib/profileHours.ts
import { BusinessHours } from './storeHours'

// ---------- utilitários internos (mesmos do storeHours) ----------

function timeToMinutes(time: string): number {
    if (!time) return -1
    const [h, m] = time.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return -1
    return h * 60 + m
}

function toLocalDateString(date: Date): string {
    const y = date.getFullYear()
    const mo = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${mo}-${d}`
}

function minutesToTime(minutes: number): string {
    if (minutes >= 1440) minutes = 0
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Retorna os intervalos de funcionamento (em minutos) para um dia específico.
 * Ex: [{start: 480, end: 720}, {start: 780, end: 1080}] para perfil com almoço.
 */
function getOpenIntervals(dayConfig: any): { start: number; end: number }[] {
    if (!dayConfig.isOpen || !dayConfig.start || !dayConfig.end) return []

    const startMin = timeToMinutes(dayConfig.start)
    let endMin = timeToMinutes(dayConfig.end)
    if (endMin === 0) endMin = 1440 // meia-noite = 24h
    if (startMin < 0 || endMin < 0 || startMin >= endMin) return []

    const intervals: { start: number; end: number }[] = []

    const lunchStartMin = dayConfig.lunchStart ? timeToMinutes(dayConfig.lunchStart) : null
    const lunchEndMin = dayConfig.lunchEnd ? timeToMinutes(dayConfig.lunchEnd) : null

    if (
        lunchStartMin != null &&
        lunchEndMin != null &&
        lunchStartMin < lunchEndMin &&
        lunchStartMin > startMin &&
        lunchEndMin < endMin
    ) {
        intervals.push({ start: startMin, end: lunchStartMin })
        intervals.push({ start: lunchEndMin, end: endMin })
    } else {
        intervals.push({ start: startMin, end: endMin })
    }

    return intervals
}

// ---------- FUNÇÕES PARA PERFIL ----------

export function isProfileOpenNow(businessHours: BusinessHours | null | undefined): boolean {
    if (!businessHours?.weekly) return false

    const now = new Date()
    const todayStr = toLocalDateString(now)

    // verifica bloqueios
    const blockedDates = businessHours.blocked_dates ?? []
    if (blockedDates.includes(todayStr)) return false

    const dayKey = String(now.getDay())
    const dayConfig = businessHours.weekly[dayKey]

    if (!dayConfig || !dayConfig.isOpen || !dayConfig.start || !dayConfig.end) return false

    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const intervals = getOpenIntervals(dayConfig)

    // está aberto se cair em algum dos intervalos (sem incluir o almoço)
    return intervals.some(({ start, end }) => currentMinutes >= start && currentMinutes < end)
}

export function getProfileStatusText(businessHours: BusinessHours | null | undefined): string {
    if (!businessHours?.weekly) return 'Agenda não configurada'

    const now = new Date()
    const todayStr = toLocalDateString(now)

    // verifica bloqueios
    const blockedDates = businessHours.blocked_dates ?? []
    if (blockedDates.includes(todayStr)) return 'Agenda fechada hoje'

    const dayKey = String(now.getDay())
    const dayConfig = businessHours.weekly[dayKey]

    if (!dayConfig || !dayConfig.isOpen) {
        return 'Agenda fechada hoje'
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const intervals = getOpenIntervals(dayConfig)

    // Verifica se está aberto agora
    const isOpen = intervals.some(({ start, end }) => currentMinutes >= start && currentMinutes < end)

    if (isOpen) {
        // Verifica se está no horário de almoço
        if (dayConfig.lunchStart && dayConfig.lunchEnd) {
            const lunchStartMin = timeToMinutes(dayConfig.lunchStart)
            const lunchEndMin = timeToMinutes(dayConfig.lunchEnd)
            if (lunchStartMin !== -1 && lunchEndMin !== -1 &&
                currentMinutes >= lunchStartMin && currentMinutes < lunchEndMin) {
                return `Agenda em intervalo · volta às ${dayConfig.lunchEnd.slice(0, 5)}`
            }
        }

        // Verifica se está perto do fechamento
        const endMinutes = timeToMinutes(dayConfig.end)
        if (endMinutes !== -1 && endMinutes - currentMinutes <= 60) {
            return `Agenda aberta até ${dayConfig.end.slice(0, 5)}`
        }

        const endTime = dayConfig.end.slice(0, 5)
        return `Agenda aberta até ${endTime}`
    }

    // Se não está aberto, verifica se é antes do horário de abertura
    const startMinutes = timeToMinutes(dayConfig.start)
    if (startMinutes !== -1 && currentMinutes < startMinutes) {
        return `Agenda abre às ${dayConfig.start.slice(0, 5)}`
    }

    return 'Agenda fechada hoje'
}

// ---------- NOVA FUNÇÃO: Status com suporte a almoço e intervalo ----------

export function getProfileStatusWithLunch(businessHours: BusinessHours | null | undefined): {
    isOpen: boolean
    text: string
    isLunchTime?: boolean
} {
    if (!businessHours?.weekly) {
        return { isOpen: false, text: 'Agenda não configurada' }
    }

    const now = new Date()
    const todayStr = toLocalDateString(now)

    // verifica bloqueios
    const blockedDates = businessHours.blocked_dates ?? []
    if (blockedDates.includes(todayStr)) {
        return { isOpen: false, text: 'Agenda fechada hoje' }
    }

    const dayKey = String(now.getDay())
    const dayConfig = businessHours.weekly[dayKey]

    if (!dayConfig || !dayConfig.isOpen || !dayConfig.start || !dayConfig.end) {
        return { isOpen: false, text: 'Agenda fechada hoje' }
    }

    const currentMinutes = now.getHours() * 60 + now.getMinutes()
    const intervals = getOpenIntervals(dayConfig)

    // 1. VERIFICA SE ESTÁ NO HORÁRIO DE INTERVALO (ALMOÇO)
    if (dayConfig.lunchStart && dayConfig.lunchEnd) {
        const lunchStartMin = timeToMinutes(dayConfig.lunchStart)
        const lunchEndMin = timeToMinutes(dayConfig.lunchEnd)
        if (lunchStartMin !== -1 && lunchEndMin !== -1 &&
            currentMinutes >= lunchStartMin && currentMinutes < lunchEndMin) {
            return {
                isOpen: true,
                text: `Agenda em intervalo · volta às ${dayConfig.lunchEnd.slice(0, 5)}`,
                isLunchTime: true
            }
        }
    }

    // 2. VERIFICA SE ESTÁ ABERTO
    const isOpen = intervals.some(({ start, end }) => currentMinutes >= start && currentMinutes < end)

    if (isOpen) {
        // Verifica se está perto do fechamento
        const endMinutes = timeToMinutes(dayConfig.end)
        if (endMinutes !== -1 && endMinutes - currentMinutes <= 60) {
            return {
                isOpen: true,
                text: `Agenda aberta até ${dayConfig.end.slice(0, 5)}`
            }
        }

        const endTime = dayConfig.end.slice(0, 5)

        // Se tem almoço, mostra o formato completo
        if (dayConfig.lunchStart && dayConfig.lunchEnd) {
            const lunchStart = dayConfig.lunchStart.slice(0, 5)
            const lunchEnd = dayConfig.lunchEnd.slice(0, 5)
            return {
                isOpen: true,
                text: `Agenda aberta até ${endTime} · intervalo ${lunchStart}-${lunchEnd}`
            }
        }

        return {
            isOpen: true,
            text: `Agenda aberta até ${endTime}`
        }
    }

    // 3. VERIFICA SE É ANTES DO HORÁRIO DE ABERTURA
    const startMinutes = timeToMinutes(dayConfig.start)
    if (startMinutes !== -1 && currentMinutes < startMinutes) {
        return {
            isOpen: false,
            text: `Agenda abre às ${dayConfig.start.slice(0, 5)}`
        }
    }

    // 4. FECHADO (fora de todos os intervalos)
    const next = getProfileNextOpeningInfo(businessHours, now)
    if (next) {
        const remaining = formatTimeRemaining(next.distanceMs)
        return {
            isOpen: false,
            text: `Agenda fechada · abre em ${remaining} (${next.dayLabel} às ${next.time})`
        }
    }

    return { isOpen: false, text: 'Agenda fechada hoje' }
}

// Para compatibilidade com o store (caso precise)
export function getProfileTodayHoursText(businessHours: BusinessHours | null | undefined): string | null {
    if (!businessHours?.weekly) return null

    const now = new Date()
    const dayKey = String(now.getDay())
    const dayConfig = businessHours.weekly[dayKey]

    if (!dayConfig || !dayConfig.start || !dayConfig.end) return null

    const intervals = getOpenIntervals(dayConfig)
    const parts = intervals.map(({ start, end }) => `${minutesToTime(start)} - ${minutesToTime(end)}`)
    return parts.join(' / ')
}

export function getProfileNextOpeningInfo(
    businessHours: BusinessHours | null | undefined,
    from: Date = new Date()
): { dayLabel: string; time: string; distanceMs: number } | null {
    if (!businessHours?.weekly) return null

    const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
    const blockedDates = businessHours.blocked_dates ?? []
    const currentMinutes = from.getHours() * 60 + from.getMinutes()

    for (let i = 0; i <= 7; i++) {
        const candidate = new Date(from)
        candidate.setDate(from.getDate() + i)
        candidate.setSeconds(0, 0)

        const dateStr = toLocalDateString(candidate)
        if (blockedDates.includes(dateStr)) continue

        const dayKey = String(candidate.getDay())
        const dayConfig = businessHours.weekly[dayKey]
        if (!dayConfig || !dayConfig.isOpen || !dayConfig.start) continue

        const intervals = getOpenIntervals(dayConfig)
        if (intervals.length === 0) continue

        for (const { start } of intervals) {
            if (i === 0 && start <= currentMinutes) continue

            candidate.setHours(Math.floor(start / 60), start % 60, 0, 0)
            const distanceMs = candidate.getTime() - from.getTime()
            return {
                dayLabel: DAY_LABELS[candidate.getDay()],
                time: dayConfig.start.slice(0, 5),
                distanceMs,
            }
        }
    }

    return null
}

export function formatTimeRemaining(ms: number): string {
    if (ms <= 0) return '0m'
    const totalMinutes = Math.floor(ms / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours > 0) {
        return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`
    }
    return `${minutes}m`
}