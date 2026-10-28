// src/lib/islandEvents.ts — o que cada evento do sistema (profile_notifications) vira na ILHA (3.0) ou na pílula do topo (2.0). Regra pura: sem React nem rede.
// Só entram os eventos "ao vivo" (pedido, entrega, avaliação, agenda); curtida, seguidor e visita ficam só na lista de notificações do perfil (seria ruído).

export type IslandLevel = 'success' | 'info' | 'message' | 'error'
export interface IslandEvent { level: IslandLevel; title: string; text: string; icon: string; path: string | null; actionLabel: string; duration: number }
export interface RawNotification { kind: string; meta?: Record<string, any> | null }

const T = (m: Record<string, any> | null | undefined, k: string) => (m && typeof m[k] === 'string' ? (m[k] as string) : '')

/** Eventos de pedido e entrega: o gatilho do banco já manda o título, o texto pronto e o destino em `meta` */
const LIVE: Record<string, { level: IslandLevel; icon: string; label: string; duration?: number }> = {
    // cliente
    order_accepted: { level: 'success', icon: '👨‍🍳', label: 'Ver pedido' },
    order_ready: { level: 'success', icon: '✅', label: 'Ver pedido', duration: 6500 },
    order_rejected: { level: 'error', icon: '🚫', label: 'Ver pedido', duration: 7000 },
    order_delivered: { level: 'success', icon: '🎉', label: 'Avaliar', duration: 7000 },
    delivery_driver_assigned: { level: 'info', icon: '🛵', label: 'Acompanhar' },
    delivery_picked_up: { level: 'info', icon: '📦', label: 'Acompanhar', duration: 6000 },
    delivery_at_door: { level: 'success', icon: '🚪', label: 'Ver pedido', duration: 20000 },   // o entregador avisou "Estou no local": o cliente precisa ir receber
    // loja
    order_new: { level: 'message', icon: '🛎️', label: 'Abrir', duration: 7000 },
    delivery_driver_accepted: { level: 'info', icon: '🛵', label: 'Ver' },
    delivery_driver_arrived: { level: 'message', icon: '🔑', label: 'Ver código', duration: 20000 },
    delivery_done: { level: 'success', icon: '✅', label: 'Ver' },
    delivery_driver_cancelled: { level: 'error', icon: '⚠️', label: 'Ver', duration: 8000 },
    // motorista
    delivery_order_ready: { level: 'success', icon: '🍕', label: 'Retirar', duration: 8000 },
    delivery_completed: { level: 'success', icon: '💰', label: 'Ver' },
    delivery_cancelled: { level: 'error', icon: '⚠️', label: 'Ver', duration: 7000 },
}

export function islandEventFor(n: RawNotification): IslandEvent | null {
    const cfg = LIVE[n.kind]
    if (cfg) {
        const title = T(n.meta, 'title'), text = T(n.meta, 'text')
        if (!text && !title) return null
        return { level: cfg.level, title, text: text || title, icon: cfg.icon, path: T(n.meta, 'path') || null, actionLabel: cfg.label, duration: cfg.duration ?? 5200 }
    }
    // eventos que já existiam e merecem aparecer na hora
    switch (n.kind) {
        case 'ride_selected': return { level: 'success', title: 'Você foi escolhido', text: 'Um passageiro escolheu você para a corrida', icon: '🚗', path: '/aceitar-corridas', actionLabel: 'Abrir', duration: 6500 }
        case 'ride_review': return { level: 'info', title: 'Nova avaliação', text: `Você recebeu ${'⭐'.repeat(Math.max(1, Math.min(5, Number(n.meta?.rating) || 5)))}${T(n.meta, 'snippet') ? ` — “${T(n.meta, 'snippet').slice(0, 70)}”` : ''}`, icon: '⭐', path: '/entregas', actionLabel: 'Ver', duration: 6000 }
        case 'appointment_new': return { level: 'message', title: 'Novo agendamento', text: T(n.meta, 'title') ? `“${T(n.meta, 'title')}”${T(n.meta, 'date') ? ` · ${String(n.meta?.date).split('-').reverse().join('/')}${T(n.meta, 'time') ? ` às ${n.meta?.time}` : ''}` : ''}` : 'Você recebeu um pedido de horário', icon: '📅', path: '/compromissos', actionLabel: 'Ver', duration: 6500 }
        case 'appointment_confirmed': return { level: 'success', title: 'Agendamento confirmado', text: T(n.meta, 'title') ? `“${T(n.meta, 'title')}” foi confirmado` : 'Seu horário foi confirmado', icon: '✅', path: '/compromissos', actionLabel: 'Ver', duration: 5200 }
        case 'appointment_cancelled': return { level: 'error', title: 'Agendamento cancelado', text: T(n.meta, 'title') ? `“${T(n.meta, 'title')}” foi cancelado` : 'Um horário foi cancelado', icon: '📅', path: '/compromissos', actionLabel: 'Ver', duration: 6500 }
        default: return null
    }
}
