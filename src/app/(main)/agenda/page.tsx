'use client'

import Link from 'next/link'
import { Plus, ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { agendamentosMockados } from '@/app/(main)/inicio/agendamentosMockados'

function groupByDay(items: any[]) {
    return items.reduce((acc: any, item) => {
        const [dia] = item.horario.split('•').map((s: string) => s.trim())

        if (!acc[dia]) acc[dia] = []
        acc[dia].push(item)

        return acc
    }, {})
}

export default function AgendaPage() {
    const router = useRouter()

    const grouped = groupByDay(agendamentosMockados)

    const renderCard = (agendamento: any) => {
        const [dia, hora] = agendamento.horario.split('•')
        const isEu = agendamento.tipo === 'meu'

        return (
            <div
                key={agendamento.id}
                className="
                    flex gap-3
                    bg-white
                    border border-gray-100
                    rounded-2xl
                    p-3
                    shadow-sm
                    hover:shadow-md
                    transition
                "
            >
                <img
                    src={agendamento.imagem}
                    className="w-14 h-14 rounded-xl object-cover border"
                />

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-xs text-gray-500 uppercase">
                                {dia}
                            </p>

                            <p className="text-lg font-black text-orange-600">
                                {hora}
                            </p>

                            <h3 className="font-bold text-gray-900 truncate">
                                {agendamento.servico}
                            </h3>

                            <p className="text-xs text-gray-500 truncate">
                                {agendamento.loja}
                            </p>
                        </div>

                        <span
                            className={`
                                text-[10px]
                                px-2 py-1
                                rounded-full
                                font-bold
                                ${isEu
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-gray-100 text-gray-500'
                                }
                            `}
                        >
                            {isEu ? 'EU' : `@${agendamento.profileSlug}`}
                        </span>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                        <span
                            className={`
                                text-[10px]
                                px-2 py-1
                                rounded-full
                                font-semibold
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
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="p-4 space-y-6">

            {/* HEADER */}
            <div className="flex items-center justify-between">

                {/* LEFT */}
                <div className="flex items-center gap-3">

                    {/* BOTÃO VOLTAR */}
                    <button
                        onClick={() => {
                            if (window.history.length > 1) {
                                router.back()
                            } else {
                                router.push('/inicio')
                            }
                        }}
                        className="
                            flex items-center gap-1
                            text-sm font-bold text-gray-600
                            bg-gray-100
                            px-3 py-2
                            rounded-full
                            hover:bg-gray-200
                            transition
                        "
                    >
                        <ArrowLeft size={14} />
                        Voltar
                    </button>

                    <div>
                        <h1 className="text-2xl font-black text-gray-900">
                            Agenda
                        </h1>
                        <p className="text-sm text-gray-500">
                            Seus agendamentos organizados por dia
                        </p>
                    </div>
                </div>

                {/* BOTÃO NOVO */}
                <Link
                    href="/agendamentos/novo"
                    className="
                        flex items-center gap-1
                        text-sm font-bold text-white
                        bg-orange-500
                        px-4 py-2
                        rounded-full
                        hover:bg-orange-600
                        transition
                    "
                >
                    <Plus size={14} />
                    Novo
                </Link>
            </div>

            {/* LISTA POR DIA */}
            <div className="space-y-6">
                {Object.entries(grouped).map(([dia, items]: any) => (
                    <div key={dia}>
                        <h2 className="text-sm font-bold text-gray-500 mb-2">
                            {dia}
                        </h2>

                        <div className="space-y-3">
                            {items.map(renderCard)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}