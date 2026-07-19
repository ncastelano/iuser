export interface DayConfig {
    isOpen: boolean
    start: string
    end: string
    lunchStart?: string
    lunchEnd?: string
}

export interface BusinessHours {
    weekly: Record<string, DayConfig>
    blocked_dates?: string[]
}

// ---------- utilitários internos ----------

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
 * Ex: [{start: 480, end: 720}, {start: 780, end: 1080}] para loja com almoço.
 */
function getOpenIntervals(dayConfig: DayConfig): { start: number; end: number }[] {
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

// ---------- funções originais (mantidas com melhorias) ----------

export function isStoreOpenNow(businessHours: BusinessHours | null | undefined): boolean {
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

export function getTodayHoursText(businessHours: BusinessHours | null | undefined): string | null {
    if (!businessHours?.weekly) return null

    const now = new Date()
    const dayKey = String(now.getDay())
    const dayConfig = businessHours.weekly[dayKey]

    if (!dayConfig || !dayConfig.start || !dayConfig.end) return null

    // Retorna o formato mais completo se houver almoço
    const intervals = getOpenIntervals(dayConfig)
    const parts = intervals.map(({ start, end }) => `${minutesToTime(start)} - ${minutesToTime(end)}`)
    return parts.join(' / ')
}

export function getNextOpeningInfo(
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

        // Procura o primeiro intervalo do dia que ainda não começou
        for (const { start } of intervals) {
            if (i === 0 && start <= currentMinutes) continue

            candidate.setHours(Math.floor(start / 60), start % 60, 0, 0)
            const distanceMs = candidate.getTime() - from.getTime()
            return {
                dayLabel: DAY_LABELS[candidate.getDay()],
                time: dayConfig.start.slice(0, 5), // mantém horário do início oficial
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

// ---------- NOVA FUNÇÃO para o banner ----------

/**
 * Retorna um objeto com:
 * - isOpen: boolean
 * - text: exatamente "Aberto 19:00 - 00:00" ou "Fechado 00:00 - 19:00"
 * 
 * Se a loja estiver aberta, mostra o intervalo completo do dia (incluindo almoço).
 * Se fechada, mostra desde o último fechamento até a próxima abertura.
 */
export function getStatusIntervalText(businessHours: BusinessHours | null | undefined): {
    isOpen: boolean
    text: string
} {
    if (!businessHours?.weekly) {
        return { isOpen: false, text: 'Fechado' }
    }

    const now = new Date()
    const intervals: { start: Date; end: Date }[] = []
    const blockedDates = businessHours.blocked_dates ?? []

    const formatTime = (d: Date): string => {
        const h = String(d.getHours()).padStart(2, '0')
        const m = String(d.getMinutes()).padStart(2, '0')
        return `${h}:${m}`
    }

    // Gerar todos os intervalos de funcionamento em uma janela de -3 a +7 dias do momento atual
    for (let i = -3; i <= 7; i++) {
        const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000)
        const dateStr = toLocalDateString(date)

        if (blockedDates.includes(dateStr)) continue

        const dayKey = String(date.getDay())
        const dayConfig = businessHours.weekly[dayKey]

        if (dayConfig && dayConfig.isOpen && dayConfig.start && dayConfig.end) {
            const dayOpenIntervals = getOpenIntervals(dayConfig)
            const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)

            for (const { start, end } of dayOpenIntervals) {
                const intervalStart = new Date(dayStart.getTime() + start * 60 * 1000)
                const intervalEnd = new Date(dayStart.getTime() + end * 60 * 1000)
                intervals.push({ start: intervalStart, end: intervalEnd })
            }
        }
    }

    // Ordenar os intervalos de forma cronológica
    intervals.sort((a, b) => a.start.getTime() - b.start.getTime())

    const nowTime = now.getTime()
    
    // Verificar se o momento atual cai em algum intervalo aberto
    const openIntervalIndex = intervals.findIndex(
        interval => nowTime >= interval.start.getTime() && nowTime < interval.end.getTime()
    )

    if (openIntervalIndex !== -1) {
        const activeInterval = intervals[openIntervalIndex]
        return {
            isOpen: true,
            text: `Aberto ${formatTime(activeInterval.start)} - ${formatTime(activeInterval.end)}`,
        }
    }

    // Se estiver fechado, encontrar o próximo intervalo que iniciará
    const nextIntervalIndex = intervals.findIndex(interval => interval.start.getTime() > nowTime)

    if (nextIntervalIndex !== -1) {
        const nextInterval = intervals[nextIntervalIndex]
        if (nextIntervalIndex > 0) {
            const prevInterval = intervals[nextIntervalIndex - 1]
            return {
                isOpen: false,
                text: `Fechado ${formatTime(prevInterval.end)} - ${formatTime(nextInterval.start)}`,
            }
        } else {
            // Caso não tenha intervalo anterior registrado na janela, assume o início do fechamento às 00:00
            return {
                isOpen: false,
                text: `Fechado 00:00 - ${formatTime(nextInterval.start)}`,
            }
        }
    }

    // Caso não tenha próximo intervalo registrado na janela
    if (intervals.length > 0) {
        const lastInterval = intervals[intervals.length - 1]
        return {
            isOpen: false,
            text: `Fechado desde ${formatTime(lastInterval.end)}`,
        }
    }

    return { isOpen: false, text: 'Fechado' }
}

// A função getStoreStatusText original continua disponível para outros usos
export function getStoreStatusText(businessHours: BusinessHours | null | undefined): string {
    const open = isStoreOpenNow(businessHours)

    if (open) {
        const hours = getTodayHoursText(businessHours)
        return hours ? `Aberto: ${hours}` : 'Aberto'
    }

    const next = getNextOpeningInfo(businessHours)
    if (next) {
        const remaining = formatTimeRemaining(next.distanceMs)
        return `Fechado · Abrirá em ${remaining}`
    }

    return 'Fechado'
}