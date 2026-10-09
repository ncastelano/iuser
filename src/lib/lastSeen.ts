// Texto do "visto por último" — usado nos cartões do /social e na página do perfil.
// Só existe quando a pessoa deixou esse horário visível pra quem está olhando (o banco decide).
export function lastSeenLabel(iso: string | null | undefined): { text: string; online: boolean } | null {
    if (!iso) return null
    const d = new Date(iso)
    const diffMin = (Date.now() - d.getTime()) / 60000
    if (diffMin < 5) return { text: 'Online agora', online: true }
    const now = new Date()
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
    const hhmm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    if (days <= 0) return { text: `Visto hoje às ${hhmm}`, online: false }
    if (days === 1) return { text: `Visto ontem às ${hhmm}`, online: false }
    if (days < 7) return { text: `Visto há ${days} dias`, online: false }
    return { text: `Visto em ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`, online: false }
}
