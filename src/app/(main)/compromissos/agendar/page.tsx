// app/(main)/compromissos/agendar/page.tsx
'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
    ArrowLeft,
    Calendar,
    Clock,
    Check,
    ChevronLeft,
    ChevronRight,
    FileText,
} from 'lucide-react'
import { useAppointments } from '../dadosDoCompromisso'
import { supabase } from '@/lib/supabase/client'

const DEFAULT_SLOTS = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '18:00']

const meses = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function pad(n: number) {
    return n.toString().padStart(2, '0')
}

export default function AgendarPage() {
    const router = useRouter()
    const { appointments, refetch } = useAppointments()

    const [step, setStep] = useState<'title' | 'datetime' | 'confirm'>('title')
    const [title, setTitle] = useState('')
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [selectedTime, setSelectedTime] = useState<string | null>(null)
    const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
    const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
    const [submitting, setSubmitting] = useState(false)

    const hoje = new Date()
    const todayStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`

    // Horários livres (considera todos os appointments, sem filtrar por slug)
    const slotsLivres = useMemo(() => {
        if (!selectedDate) return []
        const dateStr = selectedDate.toISOString().split('T')[0]
        return DEFAULT_SLOTS.filter((time) => {
            return !appointments.some(
                (a) => a.date === dateStr && a.time === time
            )
        })
    }, [selectedDate, appointments])

    // Contagem de eventos nos dias
    const eventsByDate = useMemo(() => {
        const map: Record<string, number> = {}
        appointments.forEach((a) => {
            map[a.date] = (map[a.date] || 0) + 1
        })
        return map
    }, [appointments])

    const diasDoMes = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const primeiroDia = new Date(calendarYear, calendarMonth, 1).getDay()

    function handleNextStep() {
        if (step === 'title' && title.trim()) {
            setStep('datetime')
        } else if (step === 'datetime' && selectedDate && selectedTime) {
            setStep('confirm')
        }
    }

    // Função que obtém ou cria a loja pessoal do usuário
    const getOrCreatePersonalStore = useCallback(async (userId: string) => {
        // 1. Busca perfil do usuário para gerar um slug único
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('profileSlug')
            .eq('id', userId)
            .single()

        if (profileError || !profile) {
            // fallback usando o próprio ID
            const fallbackSlug = `pessoal-${userId}`
            // procura loja com esse slug
            const { data: existing } = await supabase
                .from('stores')
                .select('id, storeSlug, name')
                .eq('storeSlug', fallbackSlug)
                .maybeSingle()

            if (existing) return existing

            // cria nova loja pessoal
            const { data: newStore, error: createError } = await supabase
                .from('stores')
                .insert({
                    name: 'Meus compromissos',
                    storeSlug: fallbackSlug,
                    owner_id: userId,
                    is_active: true,
                    is_open: true,
                })
                .select('id, storeSlug, name')
                .single()

            if (createError) throw createError
            return newStore
        }

        const personalSlug = `@${profile.profileSlug}`

        // 2. Verifica se já existe loja com esse slug
        const { data: existingStore } = await supabase
            .from('stores')
            .select('id, storeSlug, name')
            .eq('storeSlug', personalSlug)
            .maybeSingle()

        if (existingStore) return existingStore

        // 3. Cria a loja pessoal se não existir
        const { data: newStore, error: createError } = await supabase
            .from('stores')
            .insert({
                name: 'Meus compromissos',
                storeSlug: personalSlug,
                owner_id: userId,
                is_active: true,
                is_open: true,
            })
            .select('id, storeSlug, name')
            .single()

        if (createError) throw createError
        return newStore
    }, [])

    async function confirmAppointment() {
        if (!selectedDate || !selectedTime || !title.trim()) return
        setSubmitting(true)

        const { data: session } = await supabase.auth.getSession()
        if (!session.session?.user) {
            alert('Você precisa estar logado.')
            setSubmitting(false)
            return
        }

        const userId = session.session.user.id
        const dateStr = selectedDate.toISOString().split('T')[0]

        try {
            // Obtém ou cria a loja pessoal
            const personalStore = await getOrCreatePersonalStore(userId)

            const newAppointment = {
                store_id: personalStore.id,
                store_slug: personalStore.storeSlug,
                store_name: personalStore.name,
                store_logo_url: '',
                customer_id: userId,
                customer_slug: personalStore.storeSlug,   // mesmo slug para facilitar
                customer_avatar_url: '',
                owner_id: userId,
                owner_slug: personalStore.storeSlug,
                date: dateStr,
                time: selectedTime,
                service_name: title,
                service_type: 'service',
                people_count: 1,
                status: 'confirmed' as const,
                direction: 'outgoing' as const,
            }

            const { error } = await supabase.from('appointments').insert(newAppointment)
            if (error) throw error

            refetch()
            router.push('/compromissos')
        } catch (err: any) {
            alert(`Erro: ${err.message}`)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <main
            style={{
                minHeight: '100vh',
                background: '#f8fafc',
                paddingBottom: 40,
            }}
        >
            {/* HEADER */}
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
                    onClick={() => {
                        if (step === 'title') router.back()
                        else if (step === 'datetime') setStep('title')
                        else setStep('datetime')
                    }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                    <ArrowLeft size={24} color="#fff" />
                </button>
                <h1 style={{ fontSize: 32, fontWeight: 800, marginTop: 6 }}>
                    {step === 'title' && 'Agendar'}
                    {step === 'datetime' && 'Data e horário'}
                    {step === 'confirm' && 'Confirmar'}
                </h1>
                <p style={{ opacity: 0.85, marginTop: 8 }}>
                    {step === 'title' && 'um novo compromisso'}
                    {step === 'datetime' && title}
                    {step === 'confirm' && 'Revise os detalhes'}
                </p>
            </div>

            <div style={{ padding: 20 }}>
                {/* STEP 1: TÍTULO */}
                {step === 'title' && (
                    <div style={{ marginTop: 24 }}>
                        <div
                            style={{
                                background: '#fff',
                                borderRadius: 24,
                                padding: 24,
                                boxShadow: '0 10px 30px rgba(0,0,0,.05)',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                <div
                                    style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: 14,
                                        background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <FileText size={24} color="#fff" />
                                </div>
                                <h3 style={{ fontWeight: 800, fontSize: 20 }}>Qual o compromisso?</h3>
                            </div>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Ex: Reunião com equipe, estudar, médico..."
                                style={{
                                    width: '100%',
                                    padding: '16px 20px',
                                    borderRadius: 16,
                                    border: '1px solid #e2e8f0',
                                    fontSize: 18,
                                    outline: 'none',
                                    background: '#f8fafc',
                                }}
                                onKeyDown={(e) => e.key === 'Enter' && handleNextStep()}
                                autoFocus
                            />
                            <button
                                onClick={handleNextStep}
                                disabled={!title.trim()}
                                style={{
                                    width: '100%',
                                    marginTop: 20,
                                    background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 16,
                                    padding: 18,
                                    fontWeight: 800,
                                    fontSize: 18,
                                    cursor: title.trim() ? 'pointer' : 'default',
                                    opacity: title.trim() ? 1 : 0.6,
                                }}
                            >
                                Continuar
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 2: DATA E HORÁRIO */}
                {step === 'datetime' && (
                    <div style={{ marginTop: 24 }}>
                        {/* Calendário */}
                        <div
                            style={{
                                background: '#fff',
                                borderRadius: 24,
                                padding: 20,
                                boxShadow: '0 10px 30px rgba(0,0,0,.05)',
                                marginBottom: 24,
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 16,
                                }}
                            >
                                <button
                                    onClick={() => {
                                        if (calendarMonth === 0) {
                                            setCalendarMonth(11)
                                            setCalendarYear((y) => y - 1)
                                        } else {
                                            setCalendarMonth((m) => m - 1)
                                        }
                                    }}
                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                                >
                                    <ChevronLeft />
                                </button>
                                <strong style={{ fontSize: 18 }}>
                                    {meses[calendarMonth]} {calendarYear}
                                </strong>
                                <button
                                    onClick={() => {
                                        if (calendarMonth === 11) {
                                            setCalendarMonth(0)
                                            setCalendarYear((y) => y + 1)
                                        } else {
                                            setCalendarMonth((m) => m + 1)
                                        }
                                    }}
                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                                >
                                    <ChevronRight />
                                </button>
                            </div>

                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(7,1fr)',
                                    gap: 8,
                                    marginBottom: 8,
                                }}
                            >
                                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => (
                                    <div key={d} style={{ textAlign: 'center', fontWeight: 700, fontSize: 14 }}>
                                        {d}
                                    </div>
                                ))}
                            </div>

                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(7,1fr)',
                                    gap: 8,
                                }}
                            >
                                {Array.from({ length: primeiroDia }).map((_, i) => (
                                    <div key={i} />
                                ))}
                                {Array.from({ length: diasDoMes }).map((_, i) => {
                                    const dia = i + 1
                                    const date = new Date(calendarYear, calendarMonth, dia)
                                    const dateStr = date.toISOString().split('T')[0]
                                    const count = eventsByDate[dateStr] || 0
                                    const isPast = dateStr < todayStr
                                    const isSelected =
                                        selectedDate?.toDateString() === date.toDateString()

                                    return (
                                        <button
                                            key={dia}
                                            disabled={isPast}
                                            onClick={() => {
                                                setSelectedDate(date)
                                                setSelectedTime(null)
                                            }}
                                            style={{
                                                height: 40,
                                                border: 'none',
                                                borderRadius: 12,
                                                background: isSelected
                                                    ? '#7c3aed'
                                                    : isPast
                                                        ? '#f1f5f9'
                                                        : '#f8fafc',
                                                color: isSelected ? '#fff' : isPast ? '#cbd5e1' : '#0f172a',
                                                cursor: isPast ? 'default' : 'pointer',
                                                position: 'relative',
                                                fontWeight: 600,
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
                                                        width: 18,
                                                        height: 18,
                                                        borderRadius: '50%',
                                                        fontSize: 10,
                                                        fontWeight: 800,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                    }}
                                                >
                                                    {count}
                                                </div>
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Horários */}
                        {selectedDate && (
                            <div>
                                <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 16 }}>
                                    Horários disponíveis
                                </h3>
                                {slotsLivres.length === 0 ? (
                                    <div
                                        style={{
                                            background: '#fff',
                                            borderRadius: 20,
                                            padding: 24,
                                            textAlign: 'center',
                                            color: '#94a3b8',
                                        }}
                                    >
                                        Nenhum horário livre neste dia.
                                    </div>
                                ) : (
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                                            gap: 10,
                                        }}
                                    >
                                        {slotsLivres.map((time) => (
                                            <button
                                                key={time}
                                                onClick={() => {
                                                    setSelectedTime(time)
                                                    setStep('confirm')
                                                }}
                                                style={{
                                                    padding: '14px 10px',
                                                    borderRadius: 16,
                                                    border:
                                                        selectedTime === time
                                                            ? '2px solid #7c3aed'
                                                            : '1px solid #e2e8f0',
                                                    background: selectedTime === time ? '#f5f3ff' : '#fff',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    color: '#0f172a',
                                                }}
                                            >
                                                {time}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* STEP 3: CONFIRMAÇÃO */}
                {step === 'confirm' && selectedDate && selectedTime && (
                    <div style={{ marginTop: 24 }}>
                        <div
                            style={{
                                background: '#fff',
                                borderRadius: 24,
                                padding: 24,
                                boxShadow: '0 15px 40px rgba(0,0,0,.08)',
                                marginBottom: 24,
                            }}
                        >
                            <div
                                style={{
                                    width: 80,
                                    height: 80,
                                    borderRadius: 20,
                                    background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    margin: '0 auto 20px',
                                }}
                            >
                                <Calendar size={36} color="#fff" />
                            </div>
                            <h2 style={{ textAlign: 'center', fontWeight: 800, fontSize: 22 }}>
                                {title}
                            </h2>
                            <div
                                style={{
                                    marginTop: 24,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 12,
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        background: '#f8fafc',
                                        borderRadius: 16,
                                        padding: 16,
                                    }}
                                >
                                    <Calendar size={20} color="#7c3aed" />
                                    <div>
                                        <p style={{ fontWeight: 600 }}>Data</p>
                                        <p style={{ color: '#64748b' }}>
                                            {selectedDate.toLocaleDateString('pt-BR', {
                                                weekday: 'long',
                                                day: 'numeric',
                                                month: 'long',
                                            })}
                                        </p>
                                    </div>
                                </div>
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        background: '#f8fafc',
                                        borderRadius: 16,
                                        padding: 16,
                                    }}
                                >
                                    <Clock size={20} color="#7c3aed" />
                                    <div>
                                        <p style={{ fontWeight: 600 }}>Horário</p>
                                        <p style={{ color: '#64748b' }}>{selectedTime}</p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={confirmAppointment}
                                disabled={submitting}
                                style={{
                                    width: '100%',
                                    marginTop: 24,
                                    background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 20,
                                    padding: 18,
                                    fontWeight: 800,
                                    fontSize: 18,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 10,
                                    opacity: submitting ? 0.7 : 1,
                                }}
                            >
                                <Check size={22} />
                                {submitting ? 'Salvando...' : 'Salvar compromisso'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </main>
    )
}