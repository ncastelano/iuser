'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Calendar, Clock, CheckCircle2, Loader2 } from 'lucide-react'

interface ScheduleModalProps {
    isOpen: boolean
    onClose: () => void
    store: {
        id: string
        name: string
        storeSlug: string
    }
}

export function ScheduleModal({ isOpen, onClose, store }: ScheduleModalProps) {
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0])
    const [serviceName, setServiceName] = useState('')
    const [loading, setLoading] = useState(false)
    const [slots, setSlots] = useState<{ time: string, isAvailable: boolean }[]>([])
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const supabase = createClient()

    // Generate times slots (simple version: every 1 hour from 09:00 to 18:00)
    useEffect(() => {
        if (!isOpen) return

        const generateSlots = async () => {
            const times = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']
            
            // Check existing appointments for this store and date
            const checkDate = new Date(selectedDate)
            const startOfDay = new Date(checkDate.setHours(0,0,0,0)).toISOString()
            const endOfDay = new Date(checkDate.setHours(23,59,59,999)).toISOString()

            const { data: existing } = await supabase
                .from('appointments')
                .select('start_time')
                .eq('store_id', store.id)
                .gte('start_time', startOfDay)
                .lte('start_time', endOfDay)
                .neq('status', 'declined')

            const bookedTimes = (existing || []).map(a => {
                const date = new Date(a.start_time)
                return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
            })

            const newSlots = times.map(t => ({
                time: t,
                isAvailable: !bookedTimes.includes(t) && (selectedDate !== new Date().toISOString().split('T')[0] || t > new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
            }))

            setSlots(newSlots)
        }

        generateSlots()
    }, [isOpen, selectedDate, store.id])

    const handleSchedule = async () => {
        if (!selectedSlot || !serviceName) return

        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            alert('Você precisa estar logado para agendar.')
            setLoading(false)
            return
        }

        const [hours, minutes] = selectedSlot.split(':')
        const startTime = new Date(selectedDate)
        startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0)

        const { error } = await supabase
            .from('appointments')
            .insert({
                store_id: store.id,
                client_id: user.id,
                start_time: startTime.toISOString(),
                service_name: serviceName,
                status: 'pending'
            })

        if (error) {
            alert('Erro ao agendar: ' + error.message)
        } else {
            setSuccess(true)
            setTimeout(() => {
                onClose()
                setSuccess(false)
                setSelectedSlot(null)
                setServiceName('')
            }, 2000)
        }
        setLoading(false)
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-white">Agendar Horário</h2>
                        <p className="text-sm text-neutral-400">{store.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-neutral-800 rounded-xl transition-colors text-neutral-400">
                        <X size={24} />
                    </button>
                </div>

                {success ? (
                    <div className="p-12 flex flex-col items-center justify-center text-center animate-in zoom-in duration-300">
                        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6">
                            <CheckCircle2 size={48} className="text-green-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Pedido Enviado!</h3>
                        <p className="text-neutral-400">Aguarde a confirmação do estabelecimento na sua dashboard.</p>
                    </div>
                ) : (
                    <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                        {/* Service Input */}
                        <div>
                            <label className="block text-sm font-semibold text-neutral-300 mb-2 ml-1">O que você deseja fazer?</label>
                            <input
                                type="text"
                                placeholder="Ex: Corte de cabelo, Manicure, Consulta..."
                                value={serviceName}
                                onChange={(e) => setServiceName(e.target.value)}
                                className="w-full p-4 bg-neutral-950 border border-neutral-800 rounded-2xl text-white outline-none focus:border-white transition-colors"
                            />
                        </div>

                        {/* Date Picker */}
                        <div>
                            <label className="block text-sm font-semibold text-neutral-300 mb-2 ml-1">Escolha o dia</label>
                            <div className="relative">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={20} />
                                <input
                                    type="date"
                                    min={new Date().toISOString().split('T')[0]}
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="w-full p-4 pl-12 bg-neutral-950 border border-neutral-800 rounded-2xl text-white outline-none focus:border-white transition-colors [color-scheme:dark]"
                                />
                            </div>
                        </div>

                        {/* Slots */}
                        <div>
                            <label className="block text-sm font-semibold text-neutral-300 mb-3 ml-1">Horários disponíveis</label>
                            <div className="grid grid-cols-4 gap-2">
                                {slots.map((slot) => (
                                    <button
                                        key={slot.time}
                                        disabled={!slot.isAvailable}
                                        onClick={() => setSelectedSlot(slot.time)}
                                        className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                                            selectedSlot === slot.time
                                                ? 'bg-white text-black border-white'
                                                : slot.isAvailable
                                                ? 'bg-neutral-800/50 text-white border-neutral-700 hover:border-neutral-500'
                                                : 'bg-neutral-950 text-neutral-600 border-neutral-900 cursor-not-allowed'
                                        }`}
                                    >
                                        {slot.time}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Action Button */}
                        <button
                            onClick={handleSchedule}
                            disabled={loading || !selectedSlot || !serviceName}
                            className="w-full py-4 bg-white hover:bg-neutral-200 disabled:opacity-50 disabled:hover:bg-white text-black rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : <Clock size={20} />}
                            {loading ? 'Solicitando...' : 'Solicitar Agendamento'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
