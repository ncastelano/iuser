'use client'

import { useMemo, useState, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
    Search,
    Check,
    X,
    ChevronLeft,
    ChevronRight,
    Clock3,
    Plus,
} from 'lucide-react'
import {
    useAppointments,
    useUpdateAppointmentStatus,
    useDeleteAppointment,
    recomendacoes,
    type Appointment,
} from './dadosDoCompromisso'

export default function CompromissosPage() {
    const router = useRouter()
    const hoje = new Date()

    // Hooks do Supabase
    const { appointments, loading, error, refetch } = useAppointments()
    const { updateStatus } = useUpdateAppointmentStatus()
    const { deleteAppointment } = useDeleteAppointment()

    const [selectedDate, setSelectedDate] = useState<Date>(hoje)
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [calendarMonth, setCalendarMonth] = useState(hoje.getMonth())
    const [calendarYear, setCalendarYear] = useState(hoje.getFullYear())
    const [expandirAceitos, setExpandirAceitos] = useState(false)

    // ========================
    // Helpers
    // ========================
    function formatDate(date: Date) {
        return date.toISOString().split('T')[0]
    }

    function countEventsOnDate(dateStr: string) {
        return appointments.filter((a) => a.date === dateStr).length
    }

    const eventosDoDia = appointments.filter(
        (a) => a.date === formatDate(selectedDate)
    )

    const convites = appointments.filter(
        (a) => a.direction === 'incoming' && a.status === 'pending'
    )

    const aceitos = appointments.filter(
        (a) => a.direction === 'incoming' && a.status === 'confirmed'
    )

    const proximoAgendamento = useMemo(() => {
        const hojeStr = formatDate(hoje)
        const agora = hoje.getTime()
        const futuros = appointments.filter((a) => {
            if (a.date < hojeStr) return false
            if (a.date === hojeStr) {
                const [h, m] = a.time.split(':').map(Number)
                const dataComp = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), h, m)
                return dataComp.getTime() >= agora
            }
            return true
        })
        futuros.sort((a, b) => {
            const da = new Date(`${a.date}T${a.time}:00`)
            const db = new Date(`${b.date}T${b.time}:00`)
            return da.getTime() - db.getTime()
        })
        return futuros[0] || null
    }, [appointments])

    const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB']
    const diasHorizontais = useMemo(() => {
        const base = new Date(selectedDate)
        const start = new Date(base)
        start.setDate(base.getDate() - base.getDay())

        return Array.from({ length: 7 }).map((_, index) => {
            const date = new Date(start)
            date.setDate(start.getDate() + index)
            const dateStr = formatDate(date)
            const count = countEventsOnDate(dateStr)
            return {
                date,
                dia: diasSemana[date.getDay()],
                numero: date.getDate(),
                count,
            }
        })
    }, [selectedDate, appointments])

    // Contagens corrigidas
    const totalHoje = countEventsOnDate(formatDate(hoje))
    const totalGeral = appointments.length

    // Cálculo correto da semana (usando apenas datas, sem horas)
    const totalSemana = useMemo(() => {
        const inicioSemana = new Date(hoje)
        inicioSemana.setDate(hoje.getDate() - hoje.getDay())
        inicioSemana.setHours(0, 0, 0, 0)

        const fimSemana = new Date(inicioSemana)
        fimSemana.setDate(inicioSemana.getDate() + 6)
        fimSemana.setHours(23, 59, 59, 999)

        return appointments.filter((a) => {
            // Considera apenas a data, sem a hora, para evitar fuso
            const dataEvento = new Date(a.date + 'T00:00:00')
            return dataEvento >= inicioSemana && dataEvento <= fimSemana
        }).length
    }, [appointments, hoje])

    // Ações com o Supabase
    const aceitarConvite = useCallback(async (appointmentId: string) => {
        const success = await updateStatus(appointmentId, 'confirmed')
        if (success) refetch()
    }, [updateStatus, refetch])

    const recusarConvite = useCallback(async (appointmentId: string) => {
        const success = await updateStatus(appointmentId, 'cancelled')
        if (success) refetch()
    }, [updateStatus, refetch])

    const handleDeleteOutgoing = useCallback(async (appointmentId: string) => {
        if (!confirm('Deseja cancelar este agendamento?')) return
        const success = await deleteAppointment(appointmentId)
        if (success) refetch()
    }, [deleteAppointment, refetch])

    const meses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ]

    const diasDoMes = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const primeiroDia = new Date(calendarYear, calendarMonth, 1).getDay()
    const eventosDoMes = appointments.filter((a) => {
        const [ano, mes] = a.date.split('-').map(Number)
        return ano === calendarYear && mes === calendarMonth + 1
    })

    const aceitosExibidos = expandirAceitos ? aceitos : aceitos.slice(0, 2)

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-gray-600">Carregando agenda...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center flex-col gap-4">
                <p className="text-red-500">Erro ao carregar: {error}</p>
                <button onClick={refetch} className="text-purple-600 underline">Tentar novamente</button>
            </div>
        )
    }

    return (
        <main
            style={{
                minHeight: '100vh',
                background: '#f8fafc',
                paddingBottom: 120,
                position: 'relative',
            }}
        >
            {/* HEADER GRADIENTE */}
            <div
                style={{
                    background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                    padding: 24,
                    color: '#fff',
                    borderBottomLeftRadius: 32,
                    borderBottomRightRadius: 32,
                }}
            >
                <button
                    onClick={() => router.back()}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                    <ChevronLeft size={24} color="#fff" />
                </button>

                <h1 style={{ fontSize: 32, fontWeight: 800, marginTop: 6 }}>Compromissos</h1>

                <p style={{ opacity: 0.85, marginTop: 8 }}>
                    Você possui {totalGeral} compromissos no total
                </p>

                <div
                    style={{
                        marginTop: 20,
                        background: 'rgba(255,255,255,.15)',
                        borderRadius: 20,
                        padding: 16,
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                    }}
                >
                    <Search size={18} />
                    <span>Buscar compromissos...</span>
                </div>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* ESTATÍSTICAS */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))',
                        gap: 12,
                    }}
                >
                    {[
                        ['Hoje', totalHoje.toString()],
                        ['Semana', totalSemana.toString()],
                        ['Pendentes', convites.length.toString()],
                    ].map(([titulo, valor]) => (
                        <div
                            key={titulo}
                            style={{
                                background: '#fff',
                                borderRadius: 24,
                                padding: 18,
                                boxShadow: '0 10px 30px rgba(0,0,0,.05)',
                            }}
                        >
                            <p style={{ color: '#64748b', fontSize: 13 }}>{titulo}</p>
                            <h2 style={{ fontSize: 26, fontWeight: 800 }}>{valor}</h2>
                        </div>
                    ))}
                </div>

                {/* PRÓXIMO AGENDAMENTO */}
                {proximoAgendamento && (
                    <section>
                        <h2 style={{ fontWeight: 700, fontSize: 20, marginBottom: 12 }}>
                            Próximo Agendamento
                        </h2>

                        <div
                            style={{
                                background: '#fff',
                                borderRadius: 32,
                                overflow: 'hidden',
                                boxShadow: '0 15px 40px rgba(0,0,0,.08)',
                            }}
                        >
                            <div style={{ position: 'relative', height: 180 }}>
                                <Image
                                    src={proximoAgendamento.store_logo_url}
                                    alt=""
                                    fill
                                    style={{ objectFit: 'cover' }}
                                />
                            </div>

                            <div style={{ padding: 20, position: 'relative' }}>
                                <div
                                    style={{
                                        width: 72,
                                        height: 72,
                                        borderRadius: '50%',
                                        overflow: 'hidden',
                                        border: '4px solid white',
                                        position: 'absolute',
                                        top: -36,
                                        left: 20,
                                    }}
                                >
                                    <Image
                                        src={proximoAgendamento.store_logo_url}
                                        alt=""
                                        fill
                                        style={{ objectFit: 'cover' }}
                                    />
                                </div>

                                <div style={{ marginTop: 40 }}>
                                    <p style={{ color: '#64748b' }}>{proximoAgendamento.store_name}</p>
                                    <h3 style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>
                                        {proximoAgendamento.service_name}
                                    </h3>
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: 16,
                                            marginTop: 12,
                                            flexWrap: 'wrap',
                                        }}
                                    >
                                        <span>
                                            📅 {new Date(proximoAgendamento.date + 'T00:00:00').toLocaleDateString('pt-BR')}
                                        </span>
                                        <span>🕑 {proximoAgendamento.time}</span>
                                        <span
                                            style={{
                                                color:
                                                    proximoAgendamento.status === 'confirmed'
                                                        ? '#22c55e'
                                                        : proximoAgendamento.status === 'pending'
                                                            ? '#f59e0b'
                                                            : '#94a3b8',
                                                fontWeight: 600,
                                            }}
                                        >
                                            {proximoAgendamento.status === 'confirmed'
                                                ? 'Confirmado'
                                                : proximoAgendamento.status === 'pending'
                                                    ? 'Pendente'
                                                    : proximoAgendamento.status}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                                        <button
                                            style={{
                                                flex: 1,
                                                background: '#7c3aed',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: 18,
                                                padding: 14,
                                                fontWeight: 700,
                                            }}
                                        >
                                            Mensagem
                                        </button>
                                        <button
                                            style={{
                                                flex: 1,
                                                background: '#fff',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: 18,
                                                padding: 14,
                                                fontWeight: 700,
                                            }}
                                        >
                                            Detalhes
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* CALENDÁRIO */}
                <section>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 12,
                        }}
                    >
                        <h2 style={{ fontWeight: 700, fontSize: 20 }}>
                            {meses[selectedDate.getMonth()]} {selectedDate.getFullYear()}
                        </h2>

                        <button
                            onClick={() => setCalendarOpen(true)}
                            style={{
                                background: '#7c3aed',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 14,
                                padding: '10px 14px',
                                cursor: 'pointer',
                                fontWeight: 600,
                            }}
                        >
                            Ver calendário
                        </button>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            gap: 12,
                            overflowX: 'auto',
                            paddingBottom: 4,
                        }}
                    >
                        {diasHorizontais.map((item) => {
                            const ativo =
                                item.date.toDateString() === selectedDate.toDateString()
                            return (
                                <button
                                    key={item.numero}
                                    onClick={() => setSelectedDate(item.date)}
                                    style={{
                                        minWidth: 78,
                                        border: 'none',
                                        background: ativo ? '#7c3aed' : '#fff',
                                        color: ativo ? '#fff' : '#0f172a',
                                        borderRadius: 22,
                                        padding: 16,
                                        boxShadow: '0 10px 25px rgba(0,0,0,.05)',
                                        cursor: 'pointer',
                                        position: 'relative',
                                    }}
                                >
                                    <p>{item.dia}</p>
                                    <h3 style={{ fontSize: 24, fontWeight: 800 }}>{item.numero}</h3>
                                    {item.count > 0 && (
                                        <div
                                            style={{
                                                position: 'absolute',
                                                top: 8,
                                                right: 8,
                                                background: '#a855f7',
                                                color: '#fff',
                                                width: 22,
                                                height: 22,
                                                borderRadius: '50%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 12,
                                                fontWeight: 800,
                                                boxShadow: '0 2px 8px rgba(168,85,247,.5)',
                                            }}
                                        >
                                            {item.count}
                                        </div>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </section>

                {/* CALENDÁRIO POPUP */}
                {calendarOpen && (
                    <div
                        style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0,0,0,.45)',
                            zIndex: 999,
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            padding: 20,
                        }}
                    >
                        <div
                            style={{
                                width: '100%',
                                maxWidth: 500,
                                background: '#fff',
                                borderRadius: 28,
                                padding: 24,
                                maxHeight: '85vh',
                                overflowY: 'auto',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 20,
                                }}
                            >
                                <h2 style={{ fontSize: 22, fontWeight: 800 }}>Calendário</h2>
                                <button
                                    onClick={() => setCalendarOpen(false)}
                                    style={{
                                        border: 'none',
                                        background: '#f1f5f9',
                                        width: 38,
                                        height: 38,
                                        borderRadius: '50%',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* navegação */}
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 20,
                                }}
                            >
                                <button
                                    onClick={() => {
                                        if (calendarYear > 2026) {
                                            setCalendarYear((prev) => prev - 1)
                                        }
                                    }}
                                >
                                    «
                                </button>
                                <button
                                    onClick={() => {
                                        if (calendarMonth === 0) {
                                            setCalendarMonth(11)
                                            setCalendarYear((prev) => prev - 1)
                                        } else {
                                            setCalendarMonth((prev) => prev - 1)
                                        }
                                    }}
                                >
                                    <ChevronLeft />
                                </button>
                                <strong>
                                    {meses[calendarMonth]} {calendarYear}
                                </strong>
                                <button
                                    onClick={() => {
                                        if (calendarMonth === 11) {
                                            setCalendarMonth(0)
                                            setCalendarYear((prev) => prev + 1)
                                        } else {
                                            setCalendarMonth((prev) => prev + 1)
                                        }
                                    }}
                                >
                                    <ChevronRight />
                                </button>
                                <button
                                    onClick={() => {
                                        if (calendarYear < 2028) {
                                            setCalendarYear((prev) => prev + 1)
                                        }
                                    }}
                                >
                                    »
                                </button>
                            </div>

                            {/* dias da semana */}
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(7,1fr)',
                                    gap: 8,
                                    marginBottom: 12,
                                }}
                            >
                                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((dia) => (
                                    <div
                                        key={dia + Math.random()}
                                        style={{ textAlign: 'center', fontWeight: 700 }}
                                    >
                                        {dia}
                                    </div>
                                ))}
                            </div>

                            {/* grid de dias */}
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(7,1fr)',
                                    gap: 8,
                                }}
                            >
                                {Array.from({ length: primeiroDia }).map((_, index) => (
                                    <div key={index} />
                                ))}

                                {Array.from({ length: diasDoMes }).map((_, index) => {
                                    const dia = index + 1
                                    const date = new Date(calendarYear, calendarMonth, dia)
                                    const dateStr = formatDate(date)
                                    const count = countEventsOnDate(dateStr)
                                    const ativo =
                                        date.toDateString() === selectedDate.toDateString()

                                    return (
                                        <button
                                            key={dia}
                                            onClick={() => {
                                                setSelectedDate(date)
                                                setCalendarOpen(false)
                                            }}
                                            style={{
                                                height: 42,
                                                border: 'none',
                                                borderRadius: 12,
                                                background: ativo ? '#7c3aed' : '#f8fafc',
                                                color: ativo ? '#fff' : '#0f172a',
                                                cursor: 'pointer',
                                                position: 'relative',
                                            }}
                                        >
                                            {dia}
                                            {count > 0 && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: -4,
                                                        right: -4,
                                                        background: '#a855f7',
                                                        color: '#fff',
                                                        width: 20,
                                                        height: 20,
                                                        borderRadius: '50%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: 11,
                                                        fontWeight: 800,
                                                        boxShadow: '0 2px 6px rgba(168,85,247,.4)',
                                                    }}
                                                >
                                                    {count}
                                                </div>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Compromissos do mês */}
                            <div style={{ marginTop: 24 }}>
                                <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>
                                    Agendamentos de {meses[calendarMonth]} {calendarYear}
                                </h3>
                                {eventosDoMes.length === 0 ? (
                                    <p style={{ color: '#94a3b8', textAlign: 'center' }}>
                                        Nenhum agendamento neste mês
                                    </p>
                                ) : (
                                    eventosDoMes.map((evento) => (
                                        <div
                                            key={evento.id}
                                            style={{
                                                background: '#f8fafc',
                                                borderRadius: 20,
                                                padding: 16,
                                                marginBottom: 12,
                                                display: 'flex',
                                                gap: 16,
                                                alignItems: 'center',
                                                boxShadow: '0 10px 25px rgba(0,0,0,.05)',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    position: 'relative',
                                                    width: 56,
                                                    height: 56,
                                                    borderRadius: 16,
                                                    overflow: 'hidden',
                                                    flexShrink: 0,
                                                }}
                                            >
                                                <Image
                                                    src={evento.store_logo_url}
                                                    alt=""
                                                    fill
                                                    style={{ objectFit: 'cover' }}
                                                />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                    }}
                                                >
                                                    <h4 style={{ fontWeight: 800, fontSize: 16 }}>
                                                        {evento.service_name}
                                                    </h4>
                                                    <span
                                                        style={{
                                                            fontWeight: 700,
                                                            color:
                                                                evento.status === 'confirmed'
                                                                    ? '#22c55e'
                                                                    : evento.status === 'pending'
                                                                        ? '#f59e0b'
                                                                        : '#94a3b8',
                                                        }}
                                                    >
                                                        {evento.status === 'confirmed'
                                                            ? 'Confirmado'
                                                            : evento.status === 'pending'
                                                                ? 'Pendente'
                                                                : evento.status}
                                                    </span>
                                                </div>
                                                <p style={{ color: '#64748b', marginTop: 2 }}>
                                                    {evento.store_name}
                                                </p>
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        gap: 12,
                                                        marginTop: 8,
                                                        alignItems: 'center',
                                                        color: '#64748b',
                                                    }}
                                                >
                                                    <Clock3 size={14} />
                                                    <span style={{ fontSize: 14 }}>
                                                        {evento.date.split('-').reverse().join('/')} • {evento.time}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* AGENDA DO DIA */}
                <section>
                    <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 12 }}>
                        Agenda • {selectedDate.toLocaleDateString('pt-BR')}
                    </h2>

                    {eventosDoDia.length === 0 ? (
                        <div
                            style={{
                                background: '#fff',
                                borderRadius: 24,
                                padding: 24,
                                textAlign: 'center',
                            }}
                        >
                            Nenhum agendamento para este dia.
                        </div>
                    ) : (
                        eventosDoDia.map((evento) => (
                            <div
                                key={evento.id}
                                style={{
                                    background: '#fff',
                                    borderRadius: 24,
                                    padding: 16,
                                    marginBottom: 12,
                                    display: 'flex',
                                    gap: 16,
                                    alignItems: 'center',
                                    boxShadow: '0 10px 25px rgba(0,0,0,.05)',
                                }}
                            >
                                <div
                                    style={{
                                        position: 'relative',
                                        width: 72,
                                        height: 72,
                                        borderRadius: 18,
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                    }}
                                >
                                    <Image
                                        src={evento.store_logo_url}
                                        alt=""
                                        fill
                                        style={{ objectFit: 'cover' }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <h3 style={{ fontWeight: 800, fontSize: 18 }}>
                                            {evento.service_name}
                                        </h3>
                                        <span
                                            style={{
                                                fontWeight: 700,
                                                color:
                                                    evento.status === 'confirmed'
                                                        ? '#22c55e'
                                                        : evento.status === 'pending'
                                                            ? '#f59e0b'
                                                            : '#94a3b8',
                                            }}
                                        >
                                            {evento.status === 'confirmed'
                                                ? 'Confirmado'
                                                : evento.status === 'pending'
                                                    ? 'Pendente'
                                                    : evento.status}
                                        </span>
                                    </div>
                                    <p style={{ color: '#64748b', marginTop: 4 }}>
                                        {evento.store_name}
                                    </p>
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: 12,
                                            marginTop: 10,
                                            alignItems: 'center',
                                        }}
                                    >
                                        <Clock3 size={16} />
                                        <span>{evento.time}</span>
                                        {evento.direction === 'outgoing' && evento.status === 'pending' && (
                                            <button
                                                onClick={() => handleDeleteOutgoing(evento.id)}
                                                className="ml-auto text-red-500 text-sm font-medium"
                                            >
                                                Cancelar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </section>

                {/* CONVITES */}
                <section>
                    <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 12 }}>
                        Convites
                    </h2>

                    {convites.length === 0 ? (
                        <div
                            style={{
                                background: '#fff',
                                borderRadius: 24,
                                padding: 20,
                            }}
                        >
                            Nenhum convite pendente.
                        </div>
                    ) : (
                        convites.map((convite) => (
                            <div
                                key={convite.id}
                                style={{
                                    background: '#fff',
                                    borderRadius: 24,
                                    padding: 16,
                                    marginBottom: 12,
                                    boxShadow: '0 10px 25px rgba(0,0,0,.05)',
                                }}
                            >
                                <div style={{ display: 'flex', gap: 16 }}>
                                    <div
                                        style={{
                                            position: 'relative',
                                            width: 64,
                                            height: 64,
                                            borderRadius: '50%',
                                            overflow: 'hidden',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <Image
                                            src={convite.store_logo_url}
                                            alt=""
                                            fill
                                            style={{ objectFit: 'cover' }}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <h3 style={{ fontWeight: 800 }}>{convite.store_name}</h3>
                                        <p style={{ marginTop: 4 }}>{convite.service_name}</p>
                                        <p style={{ color: '#64748b', marginTop: 4 }}>
                                            {convite.date.split('-').reverse().join('/')} • {convite.time}
                                        </p>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                                    <button
                                        onClick={() => aceitarConvite(convite.id)}
                                        style={{
                                            flex: 1,
                                            background: '#22c55e',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: 16,
                                            padding: 12,
                                            display: 'flex',
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            gap: 8,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <Check size={18} />
                                        Aceitar
                                    </button>
                                    <button
                                        onClick={() => recusarConvite(convite.id)}
                                        style={{
                                            flex: 1,
                                            background: '#ef4444',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: 16,
                                            padding: 12,
                                            display: 'flex',
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            gap: 8,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <X size={18} />
                                        Recusar
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </section>

                {/* ACEITOS – Cards detalhados */}
                <section>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 12,
                        }}
                    >
                        <h2 style={{ fontWeight: 800, fontSize: 22 }}>Aceitos</h2>
                        {aceitos.length > 2 && (
                            <button
                                onClick={() => setExpandirAceitos(!expandirAceitos)}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#7c3aed',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                }}
                            >
                                {expandirAceitos ? 'Ver menos' : 'Ver todos'}
                            </button>
                        )}
                    </div>

                    {aceitos.length === 0 ? (
                        <div
                            style={{
                                background: '#fff',
                                borderRadius: 24,
                                padding: 20,
                            }}
                        >
                            Nenhum convite aceito.
                        </div>
                    ) : (
                        aceitosExibidos.map((item) => (
                            <div
                                key={item.id}
                                style={{
                                    background: '#fff',
                                    borderRadius: 24,
                                    padding: 16,
                                    marginBottom: 12,
                                    display: 'flex',
                                    gap: 16,
                                    alignItems: 'center',
                                    boxShadow: '0 10px 25px rgba(0,0,0,.05)',
                                }}
                            >
                                <div
                                    style={{
                                        position: 'relative',
                                        width: 72,
                                        height: 72,
                                        borderRadius: 18,
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                    }}
                                >
                                    <Image
                                        src={item.store_logo_url}
                                        alt=""
                                        fill
                                        style={{ objectFit: 'cover' }}
                                    />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                        }}
                                    >
                                        <h3 style={{ fontWeight: 800, fontSize: 18 }}>
                                            {item.service_name}
                                        </h3>
                                        <span style={{ color: '#22c55e', fontWeight: 700 }}>
                                            Confirmado
                                        </span>
                                    </div>
                                    <p style={{ color: '#64748b', marginTop: 4 }}>
                                        {item.store_name}
                                    </p>
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: 12,
                                            marginTop: 10,
                                            alignItems: 'center',
                                        }}
                                    >
                                        <Clock3 size={16} />
                                        <span>
                                            {item.date.split('-').reverse().join('/')} • {item.time}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </section>

                {/* RECOMENDAÇÕES */}
                <section>
                    <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 12 }}>
                        Recomendados
                    </h2>

                    <div
                        style={{
                            display: 'flex',
                            gap: 16,
                            overflowX: 'auto',
                            paddingBottom: 10,
                        }}
                    >
                        {recomendacoes.map((item, index) => (
                            <div
                                key={index}
                                style={{
                                    minWidth: 240,
                                    background: '#fff',
                                    borderRadius: 24,
                                    overflow: 'hidden',
                                }}
                            >
                                <div style={{ position: 'relative', height: 140 }}>
                                    <Image
                                        src={item.imagem}
                                        alt=""
                                        fill
                                        style={{ objectFit: 'cover' }}
                                    />
                                </div>
                                <div style={{ padding: 16 }}>
                                    <strong>{item.nome}</strong>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            {/* BOTÃO FLUTUANTE AGENDAR */}
            <button
                onClick={() => router.push('/compromissos/agendar')}
                style={{
                    position: 'fixed',
                    bottom: 32,
                    right: 24,
                    background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 32,
                    padding: '16px 28px',
                    fontWeight: 800,
                    fontSize: 18,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    boxShadow: '0 12px 40px rgba(124,58,237,.45)',
                    cursor: 'pointer',
                    zIndex: 998,
                    transition: 'transform 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
                <Plus size={24} />
                Agendar
            </button>
        </main>
    )
}