'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Calendar, Clock, CheckCircle2, Loader2 } from 'lucide-react'

interface ScheduleModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess?: () => void
    store: {
        id: string
        name: string
        storeSlug: string
    }
}

export function ScheduleModal({ isOpen, onClose, onSuccess, store }: ScheduleModalProps) {
    const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0])
    const [serviceName, setServiceName] = useState('')
    const [loading, setLoading] = useState(false)
    const [slots, setSlots] = useState<{ time: string, isAvailable: boolean }[]>([])
    const [bookedSlotsInfo, setBookedSlotsInfo] = useState<{ time: string, clientName: string, avatarUrl: string | null }[]>([])
    const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const supabase = createClient()

    // Generate times slots (simple version: every 1 hour from 09:00 to 18:00)
    useEffect(() => {
        if (!isOpen) return

        const generateSlots = async () => {
            const times = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00']
            
            // Check existing appointments for this store and date
            const checkDate = new Date(selectedDate)
            const startOfDay = new Date(checkDate.setHours(0,0,0,0)).toISOString()
            const endOfDay = new Date(checkDate.setHours(23,59,59,999)).toISOString()

            const { data: existing } = await supabase
                .from('appointments')
                .select('start_time, profiles:client_id(name, avatar_url)')
                .eq('store_id', store.id)
                .gte('start_time', startOfDay)
                .lte('start_time', endOfDay)
                .neq('status', 'declined')

            const bookedTimesMap: Record<string, { name: string, avatar: string | null }> = {}
            
            (existing || []).forEach(a => {
                const date = new Date(a.start_time)
                const t = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
                bookedTimesMap[t] = { 
                    name: (a.profiles as any)?.name || 'Cliente', 
                    avatar: (a.profiles as any)?.avatar_url 
                }
            })

            const bookedTimes = Object.keys(bookedTimesMap)

            const newSlots = times.map(t => ({
                time: t,
                isAvailable: !bookedTimes.includes(t) && (selectedDate !== new Date().toISOString().split('T')[0] || t > new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
            }))

            setSlots(newSlots)
            setBookedSlotsInfo(Object.entries(bookedTimesMap).map(([time, info]) => ({
                time,
                clientName: info.name,
                avatarUrl: info.avatar
            })))
        }

        generateSlots()
    }, [isOpen, selectedDate, store.id])

    const handleSchedule = async () => {
        if (!selectedSlot) return

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
                service_name: serviceName.trim() || 'Atendimento/Serviço',
                status: 'pending'
            })

        if (error) {
            alert('Erro ao agendar: ' + error.message)
        } else {
            setSuccess(true)
            onSuccess?.()
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative w-full max-w-lg bg-card border border-border rounded-[40px] overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="p-8 border-b border-border flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black italic uppercase tracking-tighter text-foreground leading-none">Agendar<span className="text-primary">.</span></h2>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">{store.name}</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-secondary/50 hover:bg-foreground hover:text-background rounded-2xl transition-all text-muted-foreground">
                        <X size={20} />
                    </button>
                </div>

                {success ? (
                    <div className="p-12 flex flex-col items-center justify-center text-center animate-in zoom-in duration-300">
                        <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                            <CheckCircle2 size={48} className="text-primary" />
                        </div>
                        <h3 className="text-2xl font-black italic uppercase text-foreground mb-2">Pedido Enviado!</h3>
                        <p className="text-sm font-medium text-muted-foreground">Aguarde a confirmação do estabelecimento na sua dashboard.</p>
                    </div>
                ) : (
                    <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                        {/* Service Input */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">O que você deseja fazer?</label>
                            <input
                                type="text"
                                placeholder="Ex: Corte de cabelo, Manicure..."
                                value={serviceName}
                                onChange={(e) => setServiceName(e.target.value)}
                                className="w-full p-5 bg-secondary/50 border border-border rounded-3xl text-foreground font-bold italic outline-none focus:border-primary/30 transition-all placeholder:text-muted-foreground/30 shadow-inner"
                            />
                        </div>

                        {/* Date Picker */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Escolha o dia</label>
                            <div className="relative group">
                                <Calendar className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" size={20} />
                                <input
                                    type="date"
                                    min={new Date().toISOString().split('T')[0]}
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="w-full p-5 pl-14 bg-secondary/50 border border-border rounded-3xl text-foreground font-bold outline-none focus:border-primary/30 transition-all [color-scheme:dark] dark:[color-scheme:dark] shadow-inner"
                                />
                            </div>
                        </div>

                        {/* Slots */}
                        <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Horários disponíveis</label>
                            
                            {slots.filter(s => s.isAvailable).length === 0 ? (
                                <div className="py-8 text-center bg-muted/20 border border-dashed border-border rounded-3xl">
                                    <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nenhum horário disponível para este dia.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
                                    {slots.map((slot) => (
                                        <button
                                            key={slot.time}
                                            disabled={!slot.isAvailable}
                                            onClick={() => setSelectedSlot(slot.time)}
                                            className={`p-3 rounded-2xl border text-sm font-black italic transition-all duration-300 ${
                                                selectedSlot === slot.time
                                                    ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20 scale-105'
                                                    : slot.isAvailable
                                                    ? 'bg-secondary/30 text-foreground border-border hover:border-primary/50 hover:bg-secondary/50'
                                                    : 'bg-muted/50 text-muted-foreground/20 border-border/20 cursor-not-allowed grayscale'
                                            }`}
                                        >
                                            {slot.time}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Already Booked Slots */}
                        {bookedSlotsInfo.length > 0 && (
                            <div className="pt-8 border-t border-border">
                                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40 mb-4 block ml-1">Já reservados para hoje</label>
                                <div className="space-y-3">
                                    {bookedSlotsInfo.map((info) => (
                                        <div key={info.time} className="flex items-center gap-4 p-4 bg-muted/20 border border-border/50 rounded-3xl opacity-60">
                                            <div className="w-10 h-10 rounded-2xl bg-muted border border-border flex items-center justify-center text-[10px] font-black italic text-muted-foreground">
                                                {info.time}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[11px] font-bold text-foreground truncate uppercase italic">{info.clientName}</p>
                                                <p className="text-[8px] font-black text-red-500 uppercase tracking-widest mt-0.5">Ocupado</p>
                                            </div>
                                            <div className="w-2 h-2 rounded-full bg-red-500/30" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Action Button */}
                        <div className="pt-4">
                            <button
                                onClick={handleSchedule}
                                disabled={loading || !selectedSlot}
                                className={`w-full py-6 rounded-[30px] font-black uppercase text-xs tracking-[0.3em] transition-all duration-500 flex items-center justify-center gap-3 shadow-2xl active:scale-95 ${
                                    !selectedSlot 
                                    ? 'bg-muted text-muted-foreground/40 cursor-not-allowed grayscale' 
                                    : 'bg-primary text-primary-foreground hover:scale-[1.02] shadow-primary/20'
                                }`}
                            >
                                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Clock className="w-5 h-5" />}
                                {loading ? 'Enviando...' : 'Confirmar Agendamento'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
