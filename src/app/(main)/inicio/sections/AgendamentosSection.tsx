import { ReactNode, useMemo } from 'react'
import Link from 'next/link'
import { Clock3, MapPin, ChevronRight } from 'lucide-react'
import { useAppointments } from '@/app/(main)/compromissos/dadosDoCompromisso' // ajuste o path se necessário

interface AgendamentosSectionProps {
    dragHandle?: ReactNode
}

function parseDateTime(date: string, time: string) {
    const [y, m, d] = date.split('-').map(Number)
    const [h, min] = time.split(':').map(Number)
    return new Date(y, m - 1, d, h, min).getTime()
}

export default function AgendamentosSection({ dragHandle }: AgendamentosSectionProps) {
    const { appointments, loading } = useAppointments() // dados reais

    // Ordena do mais próximo para o mais distante, pega todos (não só o próximo)
    const ordenados = useMemo(() => {
        if (!appointments.length) return []
        return [...appointments].sort(
            (a, b) => parseDateTime(a.date, a.time) - parseDateTime(b.date, b.time)
        )
    }, [appointments])

    // Renderiza cada card
    const renderCard = (appointment: (typeof ordenados)[0]) => {
        const isIncoming = appointment.direction === 'incoming'
        const isOutgoing = appointment.direction === 'outgoing'

        const directionLabel = isOutgoing
            ? '📤 Eu agendei'
            : isIncoming
                ? '📥 Minha loja'
                : '📌 Compromisso'

        const statusColor =
            appointment.status === 'confirmed'
                ? 'bg-green-100 text-green-700'
                : appointment.status === 'pending'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'

        return (
            <div
                key={appointment.id}
                className="min-w-[260px] bg-white/95 backdrop-blur-sm border border-purple-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col gap-3"
            >
                {/* Topo com avatar e informações */}
                <div className="flex items-center gap-3">
                    <img
                        src={appointment.store_logo_url || '/placeholder.png'}
                        className="w-12 h-12 rounded-xl object-cover"
                        alt=""
                    />
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400 font-medium">
                            {new Date(appointment.date).toLocaleDateString('pt-BR')}
                        </p>
                        <p className="text-xl font-black text-purple-700">{appointment.time}</p>
                    </div>
                </div>

                <div>
                    <h4 className="font-bold text-gray-800 truncate">{appointment.service_name}</h4>
                    <p className="text-sm text-gray-500 truncate flex items-center gap-1">
                        <MapPin size={12} /> {appointment.store_name}
                    </p>
                </div>

                <div className="flex items-center justify-between mt-auto">
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusColor}`}>
                        {appointment.status === 'confirmed'
                            ? 'Confirmado'
                            : appointment.status === 'pending'
                                ? 'Pendente'
                                : appointment.status}
                    </span>
                    <span className="text-xs text-gray-500 font-medium">{directionLabel}</span>
                </div>
            </div>
        )
    }

    if (loading) {
        return (
            <section>
                <div className="flex items-center gap-2 mb-3">
                    {dragHandle}
                    <h2 className="text-xl font-black text-gray-800">Compromissos</h2>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="min-w-[260px] h-36 bg-gray-100 rounded-2xl animate-pulse" />
                    ))}
                </div>
            </section>
        )
    }

    return (
        <section>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    {dragHandle}
                    <h2 className="text-xl font-black text-gray-800">Compromissos</h2>
                </div>
                <Link
                    href="/compromissos"
                    className="text-sm font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full"
                >
                    Ver todos
                </Link>
            </div>

            {ordenados.length === 0 ? (
                <div className="bg-white/80 rounded-2xl p-6 text-center text-gray-400">
                    Nenhum compromisso encontrado.
                </div>
            ) : (
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {ordenados.map(renderCard)}
                </div>
            )}
        </section>
    )
}