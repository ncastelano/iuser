'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import {
    Calendar,
    Plus,
    X,
    Trash2,
    Pencil,
    Clock,
    MapPin,
    Save,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react'

interface Appointment {
    id: string
    store_id: string
    title: string
    description?: string
    start_time: string
    end_time?: string
    location?: string
}

interface StoreCalendarProps {
    storeId: string
}

export default function StoreCalendar({ storeId }: StoreCalendarProps) {
    const { colors } = useTheme()
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [loading, setLoading] = useState(true)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
    const [form, setForm] = useState({
        title: '',
        description: '',
        start_date: '',
        start_time: '',
        end_time: '',
        location: '',
    })
    const [saving, setSaving] = useState(false)
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<Appointment | null>(null)
    const [deleting, setDeleting] = useState(false)

    // Controle do calendário
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
    const [selectedDate, setSelectedDate] = useState<string | null>(null) // formato YYYY-MM-DD

    useEffect(() => {
        fetchAppointments()
    }, [storeId])

    const fetchAppointments = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('appointments')
            .select('*')
            .eq('store_id', storeId)
            .order('start_time', { ascending: true })

        if (error) {
            console.error('Erro ao buscar agendamentos:', error)
            setAppointments([])
        } else {
            setAppointments(data || [])
        }
        setLoading(false)
    }

    // Agrupamento de compromissos por data (YYYY-MM-DD)
    const appointmentsByDate = useMemo(() => {
        const map: Record<string, Appointment[]> = {}
        appointments.forEach((apt) => {
            const dateKey = new Date(apt.start_time).toISOString().split('T')[0]
            if (!map[dateKey]) map[dateKey] = []
            map[dateKey].push(apt)
        })
        return map
    }, [appointments])

    // Compromissos do dia selecionado
    const filteredAppointments = useMemo(() => {
        if (!selectedDate) return []
        return appointmentsByDate[selectedDate] || []
    }, [selectedDate, appointmentsByDate])

    // Geração dos dias do mês (grid)
    const daysInMonth = useMemo(() => {
        const firstDay = new Date(currentYear, currentMonth, 1)
        const lastDay = new Date(currentYear, currentMonth + 1, 0)
        const days: (number | null)[] = []

        // Preencher com null até o primeiro dia da semana (dom=0, seg=1, ..., sáb=6)
        for (let i = 0; i < firstDay.getDay(); i++) {
            days.push(null)
        }
        for (let d = 1; d <= lastDay.getDate(); d++) {
            days.push(d)
        }
        return days
    }, [currentMonth, currentYear])

    const monthNames = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ]

    const goToPreviousMonth = () => {
        if (currentMonth === 0) {
            setCurrentMonth(11)
            setCurrentYear((prev) => prev - 1)
        } else {
            setCurrentMonth((prev) => prev - 1)
        }
        setSelectedDate(null)
    }

    const goToNextMonth = () => {
        if (currentMonth === 11) {
            setCurrentMonth(0)
            setCurrentYear((prev) => prev + 1)
        } else {
            setCurrentMonth((prev) => prev + 1)
        }
        setSelectedDate(null)
    }

    const todayStr = new Date().toISOString().split('T')[0]

    const openAddDialog = (date?: string) => {
        setEditingAppointment(null)
        setForm({
            title: '',
            description: '',
            start_date: date || '',
            start_time: '',
            end_time: '',
            location: '',
        })
        setDialogOpen(true)
    }

    const openEditDialog = (apt: Appointment) => {
        setEditingAppointment(apt)
        const startDate = apt.start_time ? new Date(apt.start_time) : new Date()
        const date = startDate.toISOString().split('T')[0]
        const time = startDate.toTimeString().slice(0, 5)
        const endTime = apt.end_time ? new Date(apt.end_time).toTimeString().slice(0, 5) : ''
        setForm({
            title: apt.title || '',
            description: apt.description || '',
            start_date: date,
            start_time: time,
            end_time: endTime,
            location: apt.location || '',
        })
        setDialogOpen(true)
    }

    const handleSave = async () => {
        if (!form.title.trim() || !form.start_date || !form.start_time) {
            toast.error('Preencha título, data e horário')
            return
        }
        setSaving(true)
        const start_time = `${form.start_date}T${form.start_time}:00`
        const end_time = form.end_time ? `${form.start_date}T${form.end_time}:00` : null

        try {
            if (editingAppointment) {
                const { error } = await supabase
                    .from('appointments')
                    .update({
                        title: form.title.trim(),
                        description: form.description.trim(),
                        start_time,
                        end_time,
                        location: form.location.trim(),
                    })
                    .eq('id', editingAppointment.id)
                if (error) throw error
                toast.success('Agendamento atualizado!')
            } else {
                const { error } = await supabase.from('appointments').insert({
                    store_id: storeId,
                    title: form.title.trim(),
                    description: form.description.trim(),
                    start_time,
                    end_time,
                    location: form.location.trim(),
                })
                if (error) throw error
                toast.success('Agendamento criado!')
            }
            setDialogOpen(false)
            fetchAppointments()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao salvar')
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!deleteConfirmOpen) return
        setDeleting(true)
        try {
            const { error } = await supabase.from('appointments').delete().eq('id', deleteConfirmOpen.id)
            if (error) throw error
            toast.success('Agendamento removido!')
            setDeleteConfirmOpen(null)
            fetchAppointments()
        } catch (err: any) {
            toast.error(err.message || 'Erro ao remover')
        } finally {
            setDeleting(false)
        }
    }

    const formatTime = (iso: string) => {
        return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    }

    const formatDate = (iso: string) => {
        return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
    }

    return (
        <>
            <div className="mb-6 rounded-2xl p-4 border" style={{ background: 'transparent', borderColor: colors.border }}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: colors.textPrimary }}>
                        <Calendar size={16} /> Agendamentos ({appointments.length})
                    </h3>
                    <button
                        onClick={() => openAddDialog(selectedDate || undefined)}
                        className="text-xs font-bold px-3 py-1 rounded-full"
                        style={{ background: colors.accent, color: 'white' }}
                    >
                        <Plus size={14} className="inline mr-1" />
                        Adicionar
                    </button>
                </div>

                {/* Mini Calendário */}
                <div className="mb-4">
                    {/* Cabeçalho do mês */}
                    <div className="flex items-center justify-between mb-2">
                        <button
                            onClick={goToPreviousMonth}
                            className="p-1 rounded-full hover:bg-white/10 transition-colors"
                        >
                            <ChevronLeft size={18} style={{ color: colors.textSecondary }} />
                        </button>
                        <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                            {monthNames[currentMonth]} {currentYear}
                        </span>
                        <button
                            onClick={goToNextMonth}
                            className="p-1 rounded-full hover:bg-white/10 transition-colors"
                        >
                            <ChevronRight size={18} style={{ color: colors.textSecondary }} />
                        </button>
                    </div>

                    {/* Dias da semana */}
                    <div className="grid grid-cols-7 gap-1 mb-1">
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day) => (
                            <div
                                key={day}
                                className="text-center text-[10px] font-bold py-1"
                                style={{ color: colors.textSecondary }}
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Grid de dias */}
                    <div className="grid grid-cols-7 gap-1">
                        {daysInMonth.map((day, index) => {
                            if (day === null) {
                                return <div key={`empty-${index}`} className="h-9" />
                            }
                            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                            const isToday = dateStr === todayStr
                            const isSelected = dateStr === selectedDate
                            const hasAppointments = !!appointmentsByDate[dateStr]
                            const isWeekend = new Date(currentYear, currentMonth, day).getDay() === 0 || new Date(currentYear, currentMonth, day).getDay() === 6

                            return (
                                <button
                                    key={dateStr}
                                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                                    className="h-9 rounded-lg flex flex-col items-center justify-center relative transition-all text-xs"
                                    style={{
                                        background: isSelected
                                            ? colors.accent
                                            : isToday
                                                ? `${colors.accent}20`
                                                : 'transparent',
                                        color: isSelected
                                            ? 'white'
                                            : isWeekend
                                                ? colors.textSecondary
                                                : colors.textPrimary,
                                        border: isToday && !isSelected ? `2px solid ${colors.accent}` : '2px solid transparent',
                                        fontWeight: isToday ? 700 : 500,
                                    }}
                                >
                                    {day}
                                    {hasAppointments && (
                                        <span
                                            className="absolute bottom-1 w-1 h-1 rounded-full"
                                            style={{ background: isSelected ? 'white' : colors.accent }}
                                        />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Lista de compromissos (filtrada ou todos) */}
                {loading ? (
                    <p className="text-xs text-center py-4" style={{ color: colors.textSecondary }}>
                        Carregando...
                    </p>
                ) : selectedDate ? (
                    // Compromissos do dia selecionado
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold" style={{ color: colors.textSecondary }}>
                                {formatDate(`${selectedDate}T00:00:00`)}
                            </span>
                            <button
                                onClick={() => setSelectedDate(null)}
                                className="text-[10px] font-bold underline"
                                style={{ color: colors.accent }}
                            >
                                Ver todos
                            </button>
                        </div>
                        {filteredAppointments.length === 0 ? (
                            <p className="text-xs text-center py-2" style={{ color: colors.textSecondary }}>
                                Nenhum compromisso neste dia.
                            </p>
                        ) : (
                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                {filteredAppointments.map((apt) => (
                                    <div
                                        key={apt.id}
                                        className="rounded-xl border p-3 flex items-start justify-between group"
                                        style={{ background: `${colors.accent}05`, borderColor: colors.border }}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                                {apt.title}
                                            </p>
                                            <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: colors.textSecondary }}>
                                                <Clock size={12} />
                                                <span>{formatTime(apt.start_time)}</span>
                                                {apt.end_time && (
                                                    <>
                                                        <span className="mx-1">-</span>
                                                        <span>{formatTime(apt.end_time)}</span>
                                                    </>
                                                )}
                                            </div>
                                            {apt.location && (
                                                <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: colors.textSecondary }}>
                                                    <MapPin size={12} />
                                                    <span>{apt.location}</span>
                                                </div>
                                            )}
                                            {apt.description && (
                                                <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                                                    {apt.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex gap-1 ml-2 shrink-0">
                                            <button
                                                onClick={() => openEditDialog(apt)}
                                                className="p-1 rounded-full hover:bg-white/10"
                                                title="Editar"
                                            >
                                                <Pencil size={14} style={{ color: colors.textSecondary }} />
                                            </button>
                                            <button
                                                onClick={() => setDeleteConfirmOpen(apt)}
                                                className="p-1 rounded-full hover:bg-white/10"
                                                title="Remover"
                                            >
                                                <Trash2 size={14} style={{ color: colors.textSecondary }} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    // Todos os compromissos (modo lista completa)
                    <>
                        {appointments.length === 0 ? (
                            <p className="text-xs text-center py-4" style={{ color: colors.textSecondary }}>
                                Nenhum agendamento cadastrado.
                            </p>
                        ) : (
                            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                                {[...appointments]
                                    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                                    .map((apt) => (
                                        <div
                                            key={apt.id}
                                            className="rounded-xl border p-3 flex items-start justify-between group"
                                            style={{ background: `${colors.accent}05`, borderColor: colors.border }}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                                    {apt.title}
                                                </p>
                                                <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: colors.textSecondary }}>
                                                    <Clock size={12} />
                                                    <span>{formatDate(apt.start_time)} às {formatTime(apt.start_time)}</span>
                                                    {apt.end_time && (
                                                        <>
                                                            <span className="mx-1">-</span>
                                                            <span>{formatTime(apt.end_time)}</span>
                                                        </>
                                                    )}
                                                </div>
                                                {apt.location && (
                                                    <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: colors.textSecondary }}>
                                                        <MapPin size={12} />
                                                        <span>{apt.location}</span>
                                                    </div>
                                                )}
                                                {apt.description && (
                                                    <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                                                        {apt.description}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex gap-1 ml-2 shrink-0">
                                                <button
                                                    onClick={() => openEditDialog(apt)}
                                                    className="p-1 rounded-full hover:bg-white/10"
                                                    title="Editar"
                                                >
                                                    <Pencil size={14} style={{ color: colors.textSecondary }} />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirmOpen(apt)}
                                                    className="p-1 rounded-full hover:bg-white/10"
                                                    title="Remover"
                                                >
                                                    <Trash2 size={14} style={{ color: colors.textSecondary }} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Diálogo de Adicionar / Editar (idêntico ao anterior) */}
            {dialogOpen && (
                <div
                    className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setDialogOpen(false)}
                >
                    <div
                        className="w-full max-w-xs rounded-3xl p-6 shadow-2xl max-h-[80vh] overflow-y-auto"
                        style={{ background: colors.surface }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between mb-4">
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                {editingAppointment ? 'Editar agendamento' : 'Novo agendamento'}
                            </h3>
                            <button onClick={() => setDialogOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder="Título"
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                                style={{
                                    background: colors.surface,
                                    borderColor: colors.border,
                                    color: colors.textPrimary,
                                }}
                                value={form.title}
                                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                            />
                            <textarea
                                placeholder="Descrição (opcional)"
                                className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                                style={{
                                    background: colors.surface,
                                    borderColor: colors.border,
                                    color: colors.textPrimary,
                                }}
                                rows={2}
                                value={form.description}
                                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                            />
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[9px] font-bold text-gray-400">Data</label>
                                    <input
                                        type="date"
                                        className="w-full border rounded-lg px-2 py-1.5 text-sm"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        }}
                                        value={form.start_date}
                                        onChange={(e) =>
                                            setForm((prev) => ({ ...prev, start_date: e.target.value }))
                                        }
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-gray-400">Hora início</label>
                                    <input
                                        type="time"
                                        className="w-full border rounded-lg px-2 py-1.5 text-sm"
                                        style={{
                                            background: colors.surface,
                                            borderColor: colors.border,
                                            color: colors.textPrimary,
                                        }}
                                        value={form.start_time}
                                        onChange={(e) =>
                                            setForm((prev) => ({ ...prev, start_time: e.target.value }))
                                        }
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-gray-400">Hora fim (opcional)</label>
                                <input
                                    type="time"
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    style={{
                                        background: colors.surface,
                                        borderColor: colors.border,
                                        color: colors.textPrimary,
                                    }}
                                    value={form.end_time}
                                    onChange={(e) => setForm((prev) => ({ ...prev, end_time: e.target.value }))}
                                />
                            </div>
                            <input
                                type="text"
                                placeholder="Local (opcional)"
                                className="w-full border rounded-lg px-3 py-2 text-sm"
                                style={{
                                    background: colors.surface,
                                    borderColor: colors.border,
                                    color: colors.textPrimary,
                                }}
                                value={form.location}
                                onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                            />
                            <button
                                onClick={handleSave}
                                disabled={saving || !form.title.trim() || !form.start_date || !form.start_time}
                                className="w-full py-2 rounded-full font-bold text-sm flex items-center justify-center gap-2"
                                style={{ background: colors.accent, color: 'white' }}
                            >
                                {saving ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <Save size={14} /> Salvar
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Diálogo de confirmação de exclusão (idêntico ao anterior) */}
            {deleteConfirmOpen && (
                <div
                    className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setDeleteConfirmOpen(null)}
                >
                    <div
                        className="w-full max-w-xs rounded-3xl p-6 shadow-2xl"
                        style={{ background: colors.surface }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="text-center">
                            <h3 className="text-lg font-black mb-2" style={{ color: colors.textPrimary }}>
                                Remover agendamento
                            </h3>
                            <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
                                Deseja remover <strong>{deleteConfirmOpen.title}</strong>?
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setDeleteConfirmOpen(null)}
                                    className="flex-1 py-2 rounded-full font-bold text-sm"
                                    style={{
                                        background: 'transparent',
                                        border: `1px solid ${colors.border}`,
                                        color: colors.textSecondary,
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="flex-1 py-2 rounded-full font-bold text-sm flex items-center justify-center gap-2"
                                    style={{ background: '#ef4444', color: 'white' }}
                                >
                                    {deleting ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        'Remover'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}