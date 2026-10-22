// src/lib/whatsappAppointmentNotice.ts
//
// Texto do aviso que o cliente recebe no WhatsApp quando termina um agendamento no iUser (pelo número da loja, o mesmo do bot).
// Função pura: dá para testar sem servidor. O envio e as regras (janela de 24 h, dedupe) ficam na rota /api/whatsapp/appointment-notice.

export interface AppointmentNoticeInput {
    storeName: string
    serviceName: string | null
    /** YYYY-MM-DD */
    date: string
    /** HH:MM ou HH:MM:SS */
    time: string
    status: string
    appUrl: string
    /** a loja cobra entrada e ela ainda não foi paga: valor e prazo (min) em que o horário fica reservado */
    deposit?: { amount: number; holdMinutes: number } | null
}

// "2026-10-21" -> "quarta-feira, 21/10" (sem passar por fuso: a data é só um dia do calendário)
export function formatNoticeDate(date: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || '')
    if (!m) return date
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    const weekday = d.toLocaleDateString('pt-BR', { weekday: 'long' })
    return `${weekday}, ${m[3]}/${m[2]}`
}

export function buildAppointmentNotice(a: AppointmentNoticeInput): string {
    const time = (a.time || '').slice(0, 5)
    const service = (a.serviceName || '').trim()
    const waiting = a.status === 'pending'
    const dep = a.deposit && a.deposit.amount > 0 ? a.deposit : null
    return [
        waiting ? '✅ *Agendamento registrado!*' : '✅ *Agendamento confirmado!*',
        '',
        `🏪 ${a.storeName}`,
        ...(service && service.toLowerCase() !== 'compromisso' ? [`🛠️ ${service}`] : []),
        `📅 ${formatNoticeDate(a.date)} às ${time}`,
        '',
        ...(dep ? ['', `💰 Entrada: ${dep.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, `Pague por Pix para garantir o horário (reservado por ${dep.holdMinutes} min). A chave e o botão "Já paguei" estão em Compromissos.`, ''] : []),
        dep ? 'Assim que a loja confirmar a entrada, o agendamento fica confirmado.' : waiting ? 'Aguardando a confirmação da loja.' : 'Te esperamos lá!',
        `Veja seus compromissos: ${a.appUrl}/compromissos`,
    ].join('\n')
}
