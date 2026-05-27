'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Clock, Calendar, User, CheckCircle2, XCircle } from 'lucide-react'

type Appointment = {
    id: string
    service_name: string
    start_time: string
    status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed'
    client_id: string
    profiles: {
        name: string
        profileSlug: string
        avatar_url: string | null
    }
}

export default function StoreAgendaPage() {
    const params = useParams()
    const router = useRouter()
    const storeSlug = Array.isArray(params.storeSlug) ? params.storeSlug[0] : params.storeSlug
    const profileSlug = Array.isArray(params.profileSlug) ? params.profileSlug[0] : params.profileSlug
    
    const [supabase] = useState(() => createClient())
    const [appointments, setAppointments] = useState<Appointment[]>([])
    const [isOwner, setIsOwner] = useState(false)
    const [loading, setLoading] = useState(true)
    const [store, setStore] = useState<any>(null)

    useEffect(() => {
        const load = async () => {
            // 1. Get store
            const { data: storeData } = await supabase
                .from('stores')
                .select('*')
                .ilike('storeSlug', storeSlug || '')
                .maybeSingle()

            if (!storeData) {
                setLoading(false)
                return
            }
            setStore(storeData)

            // 2. Check if owner
            const { data: { user } } = await supabase.auth.getUser()
            setIsOwner(user?.id === storeData.owner_id)

            // 3. Load appointments (8 closest)
            const { data: apptData } = await supabase
                .from('appointments')
                .select('*, profiles:client_id(name, "profileSlug", avatar_url)')
                .eq('store_id', storeData.id)
                .gte('start_time', new Date().toISOString())
                .order('start_time', { ascending: true })
                .limit(8)

            setAppointments(apptData || [])
            setLoading(false)
        }

        load()
    }, [storeSlug, supabase])

    const handleStatus = async (id: string, newStatus: string) => {
        const { error } = await supabase
            .from('appointments')
            .update({ status: newStatus })
            .eq('id', id)

        if (!error) {
            setAppointments(prev => prev.map(a => a.id === id ? { ...a, status: newStatus as any } : a))
        }
    }

    if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Carregando agenda...</div>

    return (
        <div className="min-h-screen bg-black text-white px-4 pt-8 pb-40 uppercase tracking-tighter">
            <div className="max-w-3xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                    <button onClick={() => router.back()} className="w-10 h-10 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold italic tracking-tight">Agenda</h1>
                        <p className="text-neutral-500 text-sm">{store?.name}</p>
                    </div>
                </div>

                <div className="space-y-4">
                    {appointments.length === 0 ? (
                        <div className="text-center py-20 bg-neutral-900/40 rounded-3xl border border-dashed border-neutral-800">
                            <Calendar className="w-12 h-12 text-neutral-700 mx-auto mb-3" />
                            <p className="text-neutral-500">Nenhum horário agendado recentemente.</p>
                        </div>
                    ) : (
                        appointments.map((appt) => {
                            const date = new Date(appt.start_time)
                            const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                            const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

                            return (
                                <div key={appt.id} className="group relative overflow-hidden bg-neutral-900/60 border border-neutral-800 rounded-3xl p-5 hover:border-neutral-700 transition-all">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 bg-neutral-950 rounded-2xl flex flex-col items-center justify-center border border-neutral-800 shrink-0">
                                                <span className="text-xs font-bold text-neutral-500 uppercase">{dateStr}</span>
                                                <span className="text-lg font-black text-white">{timeStr}</span>
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-white text-lg leading-tight">{appt.service_name}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs text-neutral-400">Cliente:</span>
                                                    <button 
                                                        onClick={() => router.push(`/${appt.profiles.profileSlug}`)}
                                                        className="text-xs font-semibold text-white bg-white/10 px-2 py-0.5 rounded-full hover:bg-white/20 transition-colors"
                                                    >
                                                        /{appt.profiles.profileSlug}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-2">
                                            <div className={`text-[10px] font-bold uppercase px-2 py-1 rounded-full ${
                                                appt.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500' :
                                                appt.status === 'accepted' ? 'bg-green-500/10 text-green-500' :
                                                'bg-red-500/10 text-red-500'
                                            }`}>
                                                {appt.status === 'pending' ? 'Pendente' : 
                                                 appt.status === 'accepted' ? 'Confirmado' : 
                                                 appt.status === 'declined' ? 'Recusado' : appt.status}
                                            </div>

                                            {isOwner && appt.status === 'pending' && (
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => handleStatus(appt.id, 'accepted')}
                                                        className="p-2 bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-black rounded-xl transition-all"
                                                        title="Aceitar"
                                                    >
                                                        <CheckCircle2 size={20} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleStatus(appt.id, 'declined')}
                                                        className="p-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-black rounded-xl transition-all"
                                                        title="Recusar"
                                                    >
                                                        <XCircle size={20} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {/* Glass reflection */}
                                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 blur-3xl rounded-full -mr-12 -mt-12 pointer-events-none" />
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    )
}
