// src/app/(main)/inicio/sections/AgendamentosSection.tsx

import { ReactNode, useMemo } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { agendamentosMockados } from '../agendamentosMockados'

interface AgendamentosSectionProps {
    dragHandle?: ReactNode
}

/**
 * Converte "Hoje • 14:30" em algo ordenável
 */
function parseHorario(horario: string) {
    const [diaRaw, horaRaw] = horario.split('•').map((s) => s.trim())

    const hoje = new Date()

    const mapDia: Record<string, number> = {
        Hoje: 0,
        Amanhã: 1,
        Segunda: 2,
        Terça: 3,
        Quarta: 4,
        Quinta: 5,
        Sexta: 6,
        Sábado: 7,
        Domingo: 8,
    }

    const diaIndex = mapDia[diaRaw] ?? 99

    const [h, m] = horaRaw.split(':').map(Number)
    const minutos = h * 60 + m

    return {
        diaIndex,
        minutos,
        dia: diaRaw,
        hora: horaRaw,
    }
}

export default function AgendamentosSection({
    dragHandle,
}: AgendamentosSectionProps) {
    const ordenados = useMemo(() => {
        return [...agendamentosMockados].sort((a, b) => {
            const A = parseHorario(a.horario)
            const B = parseHorario(b.horario)

            if (A.diaIndex !== B.diaIndex) {
                return A.diaIndex - B.diaIndex
            }

            return A.minutos - B.minutos
        })
    }, [])

    const renderCard = (agendamento: any) => {
        const [dia, hora] = agendamento.horario.split('•')
        const isEu = agendamento.tipo === 'meu'

        return (
            <div
                key={agendamento.id}
                className="
                    min-w-[260px]
                    bg-white/90
                    backdrop-blur-sm
                    border
                    border-orange-100
                    rounded-2xl
                    p-3
                    shadow-sm
                    hover:shadow-lg
                    transition-all
                    cursor-pointer
                    hover:-translate-y-1
                "
            >
                {/* topo */}
                <div className="flex gap-3">
                    <img
                        src={agendamento.imagem}
                        alt={agendamento.servico}
                        className="
                            w-14
                            h-14
                            rounded-xl
                            object-cover
                            border
                            border-orange-100
                        "
                    />

                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-gray-500 uppercase font-semibold">
                            {dia?.trim()}
                        </p>

                        {/* 🔥 HORA DE VERDADE */}
                        <p className="text-xl font-black text-orange-600 leading-tight">
                            {hora?.trim()}
                        </p>

                        <h3 className="text-sm font-bold text-gray-900 truncate">
                            {agendamento.servico}
                        </h3>

                        <p className="text-xs text-gray-500 truncate">
                            {agendamento.loja}
                        </p>
                    </div>
                </div>

                {/* status + identidade */}
                <div className="flex items-center justify-between mt-3">
                    <span
                        className={`
                            text-[10px]
                            px-2 py-1
                            rounded-full
                            font-semibold
                            capitalize
                            ${agendamento.status === 'confirmado'
                                ? 'bg-green-100 text-green-700'
                                : agendamento.status === 'pendente'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-blue-100 text-blue-700'
                            }
                        `}
                    >
                        {agendamento.status}
                    </span>

                    <span
                        className={`
                            text-[10px]
                            font-black
                            px-2 py-1
                            rounded-full
                            ${isEu
                                ? 'bg-orange-500 text-white'
                                : 'bg-gray-100 text-gray-500'
                            }
                        `}
                    >
                        {isEu ? 'EU' : `@${agendamento.profileSlug}`}
                    </span>
                </div>
            </div>
        )
    }

    return (
        <section>
            {/* HEADER */}
            <div className="flex items-center justify-between mb-3">

                <div className="flex items-center gap-2">
                    {dragHandle}
                    <h2 className="text-xl font-black text-gray-800">
                        Horários
                    </h2>


                </div>

                {/* 🔥 BOTÕES LADO A LADO */}
                <div className="flex items-center gap-2">
                    <Link
                        href="/agendamentos/novo"
                        className="
            flex items-center gap-1
            text-sm font-bold text-blue-600
            bg-blue-50
            px-3 py-1
            rounded-full
            hover:bg-blue-100
            transition
        "
                    >
                        <Plus size={14} />
                        Agendar
                    </Link>

                    <Link
                        href="/agenda"
                        className="
            flex items-center gap-1
            text-sm font-bold text-orange-600
            bg-orange-50
            px-3 py-1
            rounded-full
            hover:bg-orange-100
            transition
        "
                    >
                        Ver todos
                    </Link>
                </div>
            </div>

            {/* LISTA HORIZONTAL ORDENADA */}
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {ordenados.slice(0, 8).map(renderCard)}
            </div>
        </section>
    )
}