// src/app/(main)/[storeSlug]/agenda/page.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Calendar, ChevronLeft, ChevronRight,
  Clock, Check, X, AlertCircle, Plus, Loader2,
  User, Store, CheckCircle2, XCircle, ClipboardList
} from 'lucide-react'

type Appointment = {
  id: string
  store_id: string
  user_id: string
  user_name: string
  title: string
  notes: string | null
  scheduled_at: string
  duration_minutes: number
  status: 'pending' | 'confirmed' | 'cancelled' | 'done'
  created_at: string
}

type ScheduleSettings = {
  available_days: number[]
  open_time: string
  close_time: string
  slot_duration: number
  booking_message: string | null
}

type StoreInfo = {
  id: string
  name: string
  storeSlug: string
  logo_url: string | null
  owner_id: string
}

const DAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

const STATUS_CONFIG = {
  pending:   { label: 'Pendente',   color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20' },
  confirmed: { label: 'Confirmado', color: 'text-green-400',  bg: 'bg-green-400/10 border-green-400/20' },
  cancelled: { label: 'Cancelado',  color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/20' },
  done:      { label: 'Concluído',  color: 'text-neutral-400',bg: 'bg-neutral-400/10 border-neutral-400/20' },
}

function generateTimeSlots(openTime: string, closeTime: string, slotMin: number): string[] {
  const slots: string[] = []
  const [oh, om] = openTime.split(':').map(Number)
  const [ch, cm] = closeTime.split(':').map(Number)
  let cur = oh * 60 + om
  const end = ch * 60 + cm
  while (cur < end) {
    const h = Math.floor(cur / 60).toString().padStart(2, '0')
    const m = (cur % 60).toString().padStart(2, '0')
    slots.push(`${h}:${m}`)
    cur += slotMin
  }
  return slots
}

export default function AgendaPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()

  const storeSlug = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug

  const [store, setStore] = useState<StoreInfo | null>(null)
  const [settings, setSettings] = useState<ScheduleSettings | null>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null)
  const [isOwner, setIsOwner] = useState(false)

  // Calendário
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate())

  // Modal de novo agendamento
  const [showBookModal, setShowBookModal] = useState(false)
  const [bookSlot, setBookSlot] = useState<string>('')
  const [bookTitle, setBookTitle] = useState('')
  const [bookNotes, setBookNotes] = useState('')
  const [booking, setBooking] = useState(false)
  const [bookError, setBookError] = useState('')

  // Modal de gestão (dono)
  const [managingId, setManagingId] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Configuração da agenda (dono)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [editSettings, setEditSettings] = useState<ScheduleSettings>({
    available_days: [1, 2, 3, 4, 5],
    open_time: '09:00',
    close_time: '18:00',
    slot_duration: 60,
    booking_message: '',
  })
  const [savingSettings, setSavingSettings] = useState(false)

  // ─── LOAD DATA ─────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()

    const { data: storeData } = await supabase
      .from('stores')
      .select('id, name, storeSlug, logo_url, owner_id')
      .ilike('storeSlug', storeSlug || '')
      .maybeSingle()

    if (!storeData) { router.push('/'); return }

    const logo_url = storeData.logo_url
      ? supabase.storage.from('store-logos').getPublicUrl(storeData.logo_url).data.publicUrl
      : null
    setStore({ ...storeData, logo_url })

    if (user) {
      setIsOwner(user.id === storeData.owner_id)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .maybeSingle()

      setCurrentUser({
        id: user.id,
        name: profileData?.name || user.email?.split('@')[0] || 'Usuário',
      })
    }

    // Configurações da agenda
    const { data: sched } = await supabase
      .from('store_schedule_settings')
      .select('*')
      .eq('store_id', storeData.id)
      .maybeSingle()

    if (sched) {
      setSettings(sched)
      setEditSettings({
        available_days: sched.available_days || [1,2,3,4,5],
        open_time: sched.open_time || '09:00',
        close_time: sched.close_time || '18:00',
        slot_duration: sched.slot_duration || 60,
        booking_message: sched.booking_message || '',
      })
    }

    // Agendamentos do mês
    await loadAppointments(storeData.id)
    setLoading(false)
  }, [storeSlug])

  const loadAppointments = async (storeId: string) => {
    const start = new Date(viewYear, viewMonth, 1).toISOString()
    const end   = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59).toISOString()

    const { data } = await supabase
      .from('appointments')
      .select('*')
      .eq('store_id', storeId)
      .gte('scheduled_at', start)
      .lte('scheduled_at', end)
      .order('scheduled_at', { ascending: true })

    setAppointments(data || [])
  }

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (store) loadAppointments(store.id)
  }, [viewYear, viewMonth, store])

  // ─── COMPUTED ──────────────────────────────────────────────
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()

  const appointmentsOnDay = (day: number) =>
    appointments.filter(a => {
      const d = new Date(a.scheduled_at)
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === day
    })

  const selectedDateAppointments = selectedDay
    ? appointmentsOnDay(selectedDay).filter(a => a.status !== 'cancelled')
    : []

  const selectedDate = selectedDay
    ? new Date(viewYear, viewMonth, selectedDay)
    : null

  const isSelectedDayAvailable = selectedDate && settings
    ? settings.available_days.includes(selectedDate.getDay())
    : false

  const slots = settings && isSelectedDayAvailable
    ? generateTimeSlots(settings.open_time, settings.close_time, settings.slot_duration)
    : []

  const getSlotAppointment = (time: string) =>
    selectedDateAppointments.find(a => {
      const d = new Date(a.scheduled_at)
      return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}` === time
    })

  const isPastDay = (day: number) => {
    const d = new Date(viewYear, viewMonth, day)
    d.setHours(23, 59, 59)
    return d < new Date()
  }

  // ─── ACTIONS ───────────────────────────────────────────────
  const handleBookSlot = (time: string) => {
    if (!currentUser) { router.push('/login'); return }
    setBookSlot(time)
    setBookTitle('')
    setBookNotes('')
    setBookError('')
    setShowBookModal(true)
  }

  const confirmBooking = async () => {
    if (!bookTitle.trim()) { setBookError('Informe o motivo do agendamento'); return }
    if (!store || !currentUser || !selectedDay) return

    setBooking(true)
    setBookError('')

    const scheduledAt = new Date(viewYear, viewMonth, selectedDay,
      parseInt(bookSlot.split(':')[0]), parseInt(bookSlot.split(':')[1]))

    const { error } = await supabase.from('appointments').insert({
      store_id: store.id,
      user_id: currentUser.id,
      user_name: currentUser.name,
      title: bookTitle.trim(),
      notes: bookNotes.trim() || null,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: settings?.slot_duration || 60,
      status: 'pending',
    })

    if (error) {
      setBookError('Erro ao criar agendamento. Tente novamente.')
    } else {
      setShowBookModal(false)
      await loadAppointments(store!.id)
    }
    setBooking(false)
  }

  const updateStatus = async (id: string, status: Appointment['status']) => {
    setUpdatingStatus(true)
    await supabase.from('appointments').update({ status }).eq('id', id)
    if (store) await loadAppointments(store.id)
    setManagingId(null)
    setUpdatingStatus(false)
  }

  const cancelOwn = async (id: string) => {
    if (!confirm('Cancelar seu agendamento?')) return
    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', id)
    if (store) await loadAppointments(store.id)
  }

  const saveSettings = async () => {
    if (!store) return
    setSavingSettings(true)

    const { data: existing } = await supabase
      .from('store_schedule_settings')
      .select('id')
      .eq('store_id', store.id)
      .maybeSingle()

    if (existing) {
      await supabase.from('store_schedule_settings').update({
        available_days: editSettings.available_days,
        open_time: editSettings.open_time,
        close_time: editSettings.close_time,
        slot_duration: editSettings.slot_duration,
        booking_message: editSettings.booking_message,
      }).eq('store_id', store.id)
    } else {
      await supabase.from('store_schedule_settings').insert({
        store_id: store.id,
        available_days: editSettings.available_days,
        open_time: editSettings.open_time,
        close_time: editSettings.close_time,
        slot_duration: editSettings.slot_duration,
        booking_message: editSettings.booking_message,
      })
    }

    setSettings({ ...editSettings })
    setShowSettingsModal(false)
    setSavingSettings(false)
  }

  const toggleDay = (day: number) => {
    setEditSettings(prev => ({
      ...prev,
      available_days: prev.available_days.includes(day)
        ? prev.available_days.filter(d => d !== day)
        : [...prev.available_days, day].sort()
    }))
  }

  // ─── RENDER ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-neutral-400 text-sm">Carregando agenda...</p>
        </div>
      </div>
    )
  }

  if (!store) return null

  const managingAppointment = managingId ? appointments.find(a => a.id === managingId) : null

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in relative z-10">

      {/* ── HEADER ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/${store.storeSlug}`)}
            className="flex w-10 h-10 items-center justify-center bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 hover:border-white/50 transition shadow-md group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          </button>
          <div className="flex items-center gap-3">
            {store.logo_url && (
              <img src={store.logo_url} className="w-9 h-9 rounded-xl object-cover border border-neutral-800" alt={store.name} />
            )}
            <div>
              <h1 className="text-xl font-bold text-white leading-none">{store.name}</h1>
              <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Agenda
              </p>
            </div>
          </div>
        </div>

        {isOwner && (
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 border border-neutral-700 hover:border-white/30 rounded-xl text-sm font-semibold text-neutral-300 hover:text-white transition-all"
          >
            <Clock className="w-4 h-4" />
            Configurar Horários
          </button>
        )}
      </div>

      {/* ── MENSAGEM DA LOJA ───────────────────────────────── */}
      {settings?.booking_message && (
        <div className="flex items-start gap-3 px-5 py-4 bg-neutral-900/60 border border-neutral-800 rounded-2xl">
          <AlertCircle className="w-4 h-4 text-neutral-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-neutral-300 leading-relaxed">{settings.booking_message}</p>
        </div>
      )}

      {!settings && !isOwner && (
        <div className="py-20 flex flex-col items-center text-center rounded-2xl border border-neutral-800 border-dashed bg-neutral-950/40">
          <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4">
            <Calendar className="w-8 h-8 text-neutral-600" />
          </div>
          <p className="text-neutral-400 font-semibold">Agenda não configurada</p>
          <p className="text-neutral-600 text-sm mt-1">Esta loja ainda não configurou seus horários.</p>
        </div>
      )}

      {!settings && isOwner && (
        <div className="py-16 flex flex-col items-center text-center rounded-2xl border border-neutral-800 border-dashed bg-neutral-950/40">
          <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4">
            <Calendar className="w-8 h-8 text-neutral-500" />
          </div>
          <p className="text-neutral-300 font-semibold mb-1">Configure sua agenda</p>
          <p className="text-neutral-600 text-sm max-w-xs mb-6">
            Defina seus dias e horários disponíveis para que clientes possam agendar.
          </p>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-neutral-200 transition-all shadow-lg"
          >
            <Plus className="w-4 h-4" /> Configurar Agenda
          </button>
        </div>
      )}

      {settings && (
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">

          {/* ── CALENDÁRIO ─────────────────────────────────── */}
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-5 h-fit">
            {/* Navegação mês */}
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => {
                  if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
                  else setViewMonth(m => m - 1)
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-neutral-800 hover:bg-neutral-700 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-white text-sm">
                {MONTHS[viewMonth]} {viewYear}
              </span>
              <button
                onClick={() => {
                  if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
                  else setViewMonth(m => m + 1)
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-neutral-800 hover:bg-neutral-700 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Cabeçalho dias da semana */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS_SHORT.map((d, i) => (
                <div key={d} className={`text-center text-[11px] font-bold py-1 ${settings.available_days.includes(i) ? 'text-neutral-400' : 'text-neutral-700'}`}>
                  {d}
                </div>
              ))}
            </div>

            {/* Grade de dias */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstWeekday }).map((_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const dayOfWeek = new Date(viewYear, viewMonth, day).getDay()
                const isAvailable = settings.available_days.includes(dayOfWeek)
                const isToday = viewYear === today.getFullYear() && viewMonth === today.getMonth() && day === today.getDate()
                const isSelected = day === selectedDay
                const isPast = isPastDay(day)
                const dayAppts = appointmentsOnDay(day).filter(a => a.status !== 'cancelled')
                const hasAppts = dayAppts.length > 0

                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDay(day)}
                    disabled={!isAvailable && !hasAppts}
                    className={`
                      relative aspect-square flex flex-col items-center justify-center rounded-xl text-sm font-semibold transition-all
                      ${isSelected ? 'bg-white text-black shadow-lg' : ''}
                      ${!isSelected && isToday ? 'bg-neutral-800 text-white ring-1 ring-white/30' : ''}
                      ${!isSelected && !isToday && isAvailable && !isPast ? 'text-white hover:bg-neutral-800 cursor-pointer' : ''}
                      ${!isSelected && (!isAvailable || isPast) && !hasAppts ? 'text-neutral-700 cursor-default' : ''}
                      ${!isSelected && !isAvailable && hasAppts ? 'text-neutral-500 hover:bg-neutral-800 cursor-pointer' : ''}
                    `}
                  >
                    {day}
                    {hasAppts && (
                      <span className={`absolute bottom-1 w-1 h-1 rounded-full ${isSelected ? 'bg-black' : 'bg-white'}`} />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Legenda */}
            <div className="mt-4 pt-4 border-t border-neutral-800 flex flex-wrap gap-3 text-xs text-neutral-500">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-white" />Com agendamentos</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm ring-1 ring-white/30 bg-neutral-800" />Hoje</span>
            </div>

            {/* Disponibilidade */}
            <div className="mt-4 pt-4 border-t border-neutral-800">
              <p className="text-xs text-neutral-500 font-semibold uppercase tracking-widest mb-2">Disponível</p>
              <div className="flex flex-wrap gap-1.5">
                {DAYS_SHORT.map((d, i) => (
                  <span key={d} className={`px-2 py-1 rounded-lg text-xs font-bold ${settings.available_days.includes(i) ? 'bg-white/10 text-white' : 'bg-neutral-900 text-neutral-700'}`}>
                    {d}
                  </span>
                ))}
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                {settings.open_time} – {settings.close_time} · slots de {settings.slot_duration}min
              </p>
            </div>
          </div>

          {/* ── SLOTS DO DIA SELECIONADO ───────────────────── */}
          <div>
            {selectedDay ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white">
                    {selectedDay} de {MONTHS[viewMonth]}
                    {!isSelectedDayAvailable && (
                      <span className="ml-2 text-xs font-normal text-neutral-500">(dia indisponível)</span>
                    )}
                  </h2>
                  {!currentUser && isSelectedDayAvailable && !isPastDay(selectedDay) && (
                    <button
                      onClick={() => router.push('/login')}
                      className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 transition"
                    >
                      <User className="w-3 h-3" /> Faça login para agendar
                    </button>
                  )}
                </div>

                {!isSelectedDayAvailable ? (
                  <div className="py-12 flex flex-col items-center text-center rounded-2xl border border-neutral-800 bg-neutral-950/30">
                    <X className="w-8 h-8 text-neutral-700 mb-2" />
                    <p className="text-neutral-500">Este dia não está disponível para agendamentos.</p>
                    {selectedDateAppointments.length > 0 && (
                      <p className="text-xs text-neutral-600 mt-1">{selectedDateAppointments.length} agendamento(s) existente(s)</p>
                    )}
                  </div>
                ) : slots.length === 0 ? (
                  <div className="py-12 flex flex-col items-center text-center rounded-2xl border border-neutral-800 bg-neutral-950/30">
                    <AlertCircle className="w-8 h-8 text-neutral-700 mb-2" />
                    <p className="text-neutral-500">Nenhum slot configurado.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {slots.map(time => {
                      const appt = getSlotAppointment(time)
                      const slotDateTime = new Date(viewYear, viewMonth, selectedDay, parseInt(time.split(':')[0]), parseInt(time.split(':')[1]))
                      const isPastSlot = slotDateTime < new Date()
                      const isMyAppt = appt && currentUser && appt.user_id === currentUser.id

                      return (
                        <div
                          key={time}
                          className={`flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all ${
                            appt && appt.status !== 'cancelled'
                              ? 'bg-neutral-900/60 border-neutral-700'
                              : isPastSlot
                              ? 'bg-neutral-950/40 border-neutral-900 opacity-50'
                              : 'bg-neutral-900/30 border-neutral-800 hover:border-neutral-700'
                          }`}
                        >
                          {/* Hora */}
                          <div className="flex-shrink-0 w-14 text-center">
                            <span className={`text-sm font-bold font-mono ${appt && appt.status !== 'cancelled' ? 'text-white' : 'text-neutral-500'}`}>
                              {time}
                            </span>
                          </div>

                          {/* Separador */}
                          <div className={`w-px h-8 ${appt && appt.status !== 'cancelled' ? 'bg-neutral-600' : 'bg-neutral-800'}`} />

                          {/* Conteúdo */}
                          <div className="flex-1 min-w-0">
                            {appt && appt.status !== 'cancelled' ? (
                              <div className="flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-white font-semibold text-sm truncate">{appt.title}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <User className="w-3 h-3 text-neutral-500" />
                                    <span className="text-xs text-neutral-500 truncate">{appt.user_name}</span>
                                    {(isOwner || isMyAppt) && appt.notes && (
                                      <span className="text-xs text-neutral-600 truncate">· {appt.notes}</span>
                                    )}
                                  </div>
                                </div>
                                <span className={`flex-shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border ${STATUS_CONFIG[appt.status].bg} ${STATUS_CONFIG[appt.status].color}`}>
                                  {STATUS_CONFIG[appt.status].label}
                                </span>
                              </div>
                            ) : (
                              <span className={`text-sm ${isPastSlot ? 'text-neutral-700' : 'text-neutral-500'}`}>
                                {isPastSlot ? 'Horário passado' : 'Disponível'}
                              </span>
                            )}
                          </div>

                          {/* Ações */}
                          <div className="flex-shrink-0">
                            {appt && appt.status !== 'cancelled' ? (
                              isOwner ? (
                                <button
                                  onClick={() => setManagingId(appt.id)}
                                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-xl text-xs font-bold text-neutral-300 hover:text-white transition"
                                >
                                  Gerenciar
                                </button>
                              ) : isMyAppt ? (
                                <button
                                  onClick={() => cancelOwn(appt.id)}
                                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl text-xs font-bold text-red-400 transition"
                                >
                                  Cancelar
                                </button>
                              ) : null
                            ) : (
                              !isPastSlot && currentUser && (
                                <button
                                  onClick={() => handleBookSlot(time)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-black font-bold text-xs rounded-xl hover:bg-neutral-200 transition shadow-sm"
                                >
                                  <Plus className="w-3.5 h-3.5" /> Agendar
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="py-20 flex flex-col items-center text-center rounded-2xl border border-neutral-800 bg-neutral-950/30">
                <Calendar className="w-10 h-10 text-neutral-700 mb-3" />
                <p className="text-neutral-500">Selecione um dia no calendário</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: NOVO AGENDAMENTO ─────────────────────────── */}
      {showBookModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" onClick={() => setShowBookModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5" /> Agendar horário
                </h3>
                <button onClick={() => setShowBookModal(false)} className="w-8 h-8 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center hover:bg-neutral-800 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl px-4 py-3 flex items-center gap-3">
                <Clock className="w-4 h-4 text-neutral-400" />
                <div>
                  <p className="text-xs text-neutral-500">Horário selecionado</p>
                  <p className="text-white font-bold">{selectedDay} de {MONTHS[viewMonth]} às {bookSlot}</p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-neutral-500 font-semibold uppercase tracking-widest">
                    Motivo / Título <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={bookTitle}
                    onChange={e => setBookTitle(e.target.value)}
                    placeholder="Ex: Consulta, Corte de cabelo..."
                    className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-xl text-white text-sm placeholder:text-neutral-600 focus:outline-none focus:border-white/50 transition"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-neutral-500 font-semibold uppercase tracking-widest">
                    Observações (opcional)
                  </label>
                  <textarea
                    value={bookNotes}
                    onChange={e => setBookNotes(e.target.value)}
                    placeholder="Informações extras para o estabelecimento..."
                    rows={3}
                    className="w-full px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-xl text-white text-sm placeholder:text-neutral-600 focus:outline-none focus:border-white/50 transition resize-none"
                  />
                </div>
              </div>

              {bookError && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{bookError}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setShowBookModal(false)} className="flex-1 py-3 rounded-xl font-bold text-sm bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition text-neutral-300">
                  Cancelar
                </button>
                <button
                  disabled={booking || !bookTitle.trim()}
                  onClick={confirmBooking}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-white text-black hover:bg-neutral-200 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {booking ? <><Loader2 className="w-4 h-4 animate-spin" /> Agendando...</> : <><Check className="w-4 h-4" /> Confirmar</>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── MODAL: GERENCIAR AGENDAMENTO (dono) ────────────── */}
      {managingAppointment && (
        <>
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" onClick={() => setManagingId(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl p-6 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Gerenciar Agendamento</h3>
                <button onClick={() => setManagingId(null)} className="w-8 h-8 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center hover:bg-neutral-800 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2 bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4">
                <p className="text-white font-bold text-base">{managingAppointment.title}</p>
                <div className="flex items-center gap-1.5 text-sm text-neutral-400">
                  <User className="w-3.5 h-3.5" />
                  {managingAppointment.user_name}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-neutral-400">
                  <Clock className="w-3.5 h-3.5" />
                  {new Date(managingAppointment.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
                {managingAppointment.notes && (
                  <p className="text-xs text-neutral-500 mt-1 pt-2 border-t border-neutral-800">
                    📝 {managingAppointment.notes}
                  </p>
                )}
                <span className={`mt-1 self-start text-[11px] font-bold px-2.5 py-1 rounded-full border ${STATUS_CONFIG[managingAppointment.status].bg} ${STATUS_CONFIG[managingAppointment.status].color}`}>
                  {STATUS_CONFIG[managingAppointment.status].label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {managingAppointment.status !== 'confirmed' && (
                  <button disabled={updatingStatus} onClick={() => updateStatus(managingAppointment.id, 'confirmed')} className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition disabled:opacity-40">
                    <CheckCircle2 className="w-4 h-4" /> Confirmar
                  </button>
                )}
                {managingAppointment.status !== 'done' && (
                  <button disabled={updatingStatus} onClick={() => updateStatus(managingAppointment.id, 'done')} className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 transition disabled:opacity-40">
                    <Check className="w-4 h-4" /> Concluído
                  </button>
                )}
                {managingAppointment.status !== 'cancelled' && (
                  <button disabled={updatingStatus} onClick={() => updateStatus(managingAppointment.id, 'cancelled')} className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition disabled:opacity-40">
                    <XCircle className="w-4 h-4" /> Cancelar
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── MODAL: CONFIGURAR HORÁRIOS (dono) ──────────────── */}
      {showSettingsModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm" onClick={() => setShowSettingsModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="w-full max-w-lg bg-neutral-950 border border-neutral-800 rounded-3xl shadow-2xl p-6 flex flex-col gap-5 my-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Clock className="w-5 h-5" /> Configurar Agenda
                </h3>
                <button onClick={() => setShowSettingsModal(false)} className="w-8 h-8 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center hover:bg-neutral-800 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Dias da semana */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-neutral-500 font-semibold uppercase tracking-widest">Dias Disponíveis</label>
                <div className="flex gap-2 flex-wrap">
                  {DAYS_SHORT.map((d, i) => (
                    <button
                      key={d}
                      onClick={() => toggleDay(i)}
                      className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                        editSettings.available_days.includes(i)
                          ? 'bg-white text-black border-white'
                          : 'bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-600'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Horários */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-neutral-500 font-semibold uppercase tracking-widest">Abertura</label>
                  <input
                    type="time"
                    value={editSettings.open_time}
                    onChange={e => setEditSettings(p => ({ ...p, open_time: e.target.value }))}
                    className="px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-white/50 transition"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-neutral-500 font-semibold uppercase tracking-widest">Fechamento</label>
                  <input
                    type="time"
                    value={editSettings.close_time}
                    onChange={e => setEditSettings(p => ({ ...p, close_time: e.target.value }))}
                    className="px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-white/50 transition"
                  />
                </div>
              </div>

              {/* Duração do slot */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-neutral-500 font-semibold uppercase tracking-widest">Duração de cada slot</label>
                <div className="flex gap-2 flex-wrap">
                  {[15, 30, 45, 60, 90, 120].map(min => (
                    <button
                      key={min}
                      onClick={() => setEditSettings(p => ({ ...p, slot_duration: min }))}
                      className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                        editSettings.slot_duration === min
                          ? 'bg-white text-black border-white'
                          : 'bg-neutral-900 text-neutral-500 border-neutral-800 hover:border-neutral-600'
                      }`}
                    >
                      {min < 60 ? `${min}min` : `${min/60}h`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Mensagem */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-neutral-500 font-semibold uppercase tracking-widest">
                  Mensagem para clientes (opcional)
                </label>
                <textarea
                  value={editSettings.booking_message || ''}
                  onChange={e => setEditSettings(p => ({ ...p, booking_message: e.target.value }))}
                  placeholder="Ex: Confirmação via WhatsApp. Chegue 5min antes."
                  rows={2}
                  className="px-4 py-3 bg-neutral-900 border border-neutral-700 rounded-xl text-white text-sm placeholder:text-neutral-600 focus:outline-none focus:border-white/50 transition resize-none"
                />
              </div>

              {/* Preview */}
              {editSettings.available_days.length > 0 && (
                <div className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-3 text-xs text-neutral-400">
                  Preview: {editSettings.available_days.map(d => DAYS_SHORT[d]).join(', ')} · {editSettings.open_time}–{editSettings.close_time} · {generateTimeSlots(editSettings.open_time, editSettings.close_time, editSettings.slot_duration).length} slots de {editSettings.slot_duration}min
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setShowSettingsModal(false)} className="flex-1 py-3 rounded-xl font-bold text-sm bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 transition text-neutral-300">
                  Cancelar
                </button>
                <button
                  disabled={savingSettings || editSettings.available_days.length === 0}
                  onClick={saveSettings}
                  className="flex-1 py-3 rounded-xl font-bold text-sm bg-white text-black hover:bg-neutral-200 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {savingSettings ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Check className="w-4 h-4" />Salvar Configurações</>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
