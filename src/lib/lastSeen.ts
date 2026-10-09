// Texto do "visto por último" / status — usado nos cartões do /social e na página do perfil.
// Só existe quando a pessoa deixou isso visível pra quem está olhando (o banco decide).
export interface PresenceInfo { at: string | null; online: boolean; offline: boolean }

export function lastSeenLabel(info: PresenceInfo | null | undefined): { text: string; online: boolean } | null {
    if (!info) return null
    if (info.online) return { text: 'Online agora', online: true }
    if (info.offline) return { text: 'Offline', online: false }       // a pessoa escolheu aparecer offline
    if (!info.at) return null
    const d = new Date(info.at)
    const now = new Date()
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
    const hhmm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    if (days <= 0) return { text: `Visto hoje às ${hhmm}`, online: false }
    if (days === 1) return { text: `Visto ontem às ${hhmm}`, online: false }
    if (days < 7) return { text: `Visto há ${days} dias`, online: false }
    return { text: `Visto em ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`, online: false }
}
