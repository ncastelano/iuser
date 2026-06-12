// app/(main)/compromissos/page.tsx
'use client'

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react'
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
    Trash2,
    UserPlus,
    Settings,
    Users,
    Calendar,
    Edit3,
    Eye,
    Store,
    Bell,
    UserCheck,
    ListChecks,
    LayoutGrid,
    User,
    Lock,
} from 'lucide-react'
import {
    useAppointments,
    useUpdateAppointmentStatus,
    useDeleteAppointment,
    type Appointment,
} from './dadosDoCompromisso'
import { supabase } from '@/lib/supabase/client'
import HorarioEDisponibilidade from './HorarioEDisponibilidade'
import AnimatedBackground from '@/components/AnimatedBackground'

/* ===================================================
   Busca nome do perfil a partir do slug
   =================================================== */
function ProfileName({ slug }: { slug: string }) {
    const [name, setName] = useState<string | null>(null)
    useEffect(() => {
        if (!slug) return
        supabase
            .from('profiles')
            .select('name')
            .eq('profileSlug', slug)
            .single()
            .then(({ data }) => {
                if (data) setName(data.name)
            })
    }, [slug])
    if (name) return <>{name}</>
    return <span className="text-white/50">@{slug}</span>
}

/* ===================================================
   Avatar adaptável: loja (logo), convite (avatar do convidado), pessoal (avatar do usuário)
   =================================================== */
function AppointmentAvatar({
    url,
    name,
    type,
    size = 72,
}: {
    url: string | null
    name: string
    type: 'store' | 'personal' | 'invite'
    size?: number
}) {
    const isValidImageUrl = (url: string | null): boolean => {
        if (!url) return false
        return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')
    }

    if (type === 'store') {
        if (isValidImageUrl(url)) {
            return (
                <div style={{
                    position: 'relative',
                    width: size,
                    height: size,
                    borderRadius: size > 56 ? 18 : 16,
                    overflow: 'hidden',
                    flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}>
                    <Image src={url!} alt={name} fill style={{ objectFit: 'cover' }} />
                </div>
            )
        }
        return (
            <div style={{
                width: size,
                height: size,
                borderRadius: size > 56 ? 18 : 16,
                background: 'linear-gradient(135deg, #f97316, #fbbf24)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#fff',
                boxShadow: '0 4px 12px rgba(249,115,22,0.25)',
            }}>
                <Store size={size * 0.5} strokeWidth={1.5} />
            </div>
        )
    }

    if (type === 'invite') {
        if (isValidImageUrl(url)) {
            return (
                <div style={{
                    position: 'relative',
                    width: size,
                    height: size,
                    borderRadius: size > 56 ? 18 : 16,
                    overflow: 'hidden',
                    flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}>
                    <Image src={url!} alt={name} fill style={{ objectFit: 'cover' }} />
                </div>
            )
        }
        return (
            <div style={{
                width: size,
                height: size,
                borderRadius: size > 56 ? 18 : 16,
                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#fff',
                boxShadow: '0 4px 12px rgba(124,58,237,0.3)',
            }}>
                <User size={size * 0.5} strokeWidth={1.5} />
            </div>
        )
    }

    // personal
    if (isValidImageUrl(url)) {
        return (
            <div style={{
                position: 'relative',
                width: size,
                height: size,
                borderRadius: size > 56 ? 18 : 16,
                overflow: 'hidden',
                flexShrink: 0,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}>
                <Image src={url!} alt={name} fill style={{ objectFit: 'cover' }} />
            </div>
        )
    }
    return (
        <div style={{
            width: size,
            height: size,
            borderRadius: size > 56 ? 18 : 16,
            background: 'linear-gradient(135deg, #10b981, #34d399)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: '#fff',
            boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
        }}>
            <Lock size={size * 0.5} strokeWidth={1.5} />
        </div>
    )
}

/* ===================================================
   Nome do remetente (convite)
   =================================================== */
function SenderName({ ownerSlug }: { ownerSlug: string }) {
    const [name, setName] = useState<string | null>(null)
    useEffect(() => {
        if (!ownerSlug) return
        supabase
            .from('profiles')
            .select('name')
            .eq('profileSlug', ownerSlug)
            .single()
            .then(({ data }) => {
                if (data) setName(data.name)
            })
    }, [ownerSlug])
    if (name) return <>{name}</>
    return <span className="text-white/50">@{ownerSlug}</span>
}

/* ===================================================
   Funções auxiliares
   =================================================== */
function formatTime(time: string) {
    if (!time) return ''
    return time.slice(0, 5)
}

function parseDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(y, m - 1, d)
}

function getTimeRemaining(dateStr: string, timeStr: string): string {
    const now = new Date()
    const targetDate = parseDate(dateStr)
    const [h, min] = timeStr.split(':').map(Number)
    targetDate.setHours(h, min, 0, 0)
    const diffMs = targetDate.getTime() - now.getTime()
    if (diffMs <= 0) return 'agora'
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 60) return `em ${diffMin}min`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `em ${diffH}h`
    const diffD = Math.floor(diffH / 24)
    if (diffD === 1) return 'amanhã'
    if (diffD < 7) return `em ${diffD} dias`
    return targetDate.toLocaleDateString('pt-BR')
}

function VisibilityBadge({ isPublic }: { isPublic: boolean }) {
    return (
        <span
            style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 10,
                backgroundColor: isPublic ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.1)',
                color: isPublic ? '#10b981' : '#fff',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                whiteSpace: 'nowrap',
            }}
        >
            {isPublic ? 'Público' : 'Privado'}
        </span>
    )
}

function ParticipantsMini({ participants }: { participants: any[] }) {
    if (!participants.length) return null
    const displayNames = participants.slice(0, 3).map(p => p.profile?.name || p.customer_slug)
    const extra = participants.length - 3
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
            <Users size={12} />
            <span>{displayNames.join(', ')}{extra > 0 && ` +${extra}`}</span>
        </div>
    )
}

/* ===================================================
   Página principal
   =================================================== */
export default function CompromissosPage() {
    const router = useRouter()
    const hoje = new Date()

    const { appointments, loading, error, refetch } = useAppointments()
    const { updateStatus } = useUpdateAppointmentStatus()
    const { deleteAppointment } = useDeleteAppointment()

    const [selectedDate, setSelectedDate] = useState<Date>(hoje)
    const [calendarOpen, setCalendarOpen] = useState(false)
    const [calendarMonth, setCalendarMonth] = useState(hoje.getMonth())
    const [calendarYear, setCalendarYear] = useState(hoje.getFullYear())
    const [showPendentesModal, setShowPendentesModal] = useState(false)
    const [showPendingInNext, setShowPendingInNext] = useState(true)

    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
    const [detailModalOpen, setDetailModalOpen] = useState(false)
    const [inviteSlugDetail, setInviteSlugDetail] = useState('')
    const [searchedProfileDetail, setSearchedProfileDetail] = useState<any>(null)
    const [searchingDetail, setSearchingDetail] = useState(false)
    const [allowGuestInvites, setAllowGuestInvites] = useState(false)
    const [participants, setParticipants] = useState<any[]>([])

    const [showAllAcceptedModal, setShowAllAcceptedModal] = useState(false)
    const [acceptedSearch, setAcceptedSearch] = useState('')

    const [userId, setUserId] = useState<string | null>(null)
    const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null)

    const [myStores, setMyStores] = useState<any[]>([])
    const [activeTab, setActiveTab] = useState<string>('pessoal')

    const [showSettingsModal, setShowSettingsModal] = useState(false)

    const [participantsMap, setParticipantsMap] = useState<Record<string, any[]>>({})
    const fetchedIdsRef = useRef<Set<string>>(new Set())

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                setUserId(session.user.id)
                supabase
                    .from('profiles')
                    .select('avatar_url')
                    .eq('id', session.user.id)
                    .single()
                    .then(({ data }) => {
                        if (data?.avatar_url) setUserAvatarUrl(data.avatar_url)
                    })
                supabase
                    .from('stores')
                    .select('id, name, storeSlug, logo_url')
                    .eq('owner_id', session.user.id)
                    .neq('name', 'Meus compromissos')
                    .then(({ data }) => {
                        if (data) setMyStores(data)
                    })
            }
        })
    }, [])

    function formatDate(date: Date) {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    const filteredAppointments = useMemo(() => {
        if (!userId) return []
        if (activeTab === 'pessoal') {
            return appointments.filter((a) => a.customer_id === userId)
        }
        return appointments.filter((a) => String(a.store_id) === String(activeTab))
    }, [appointments, userId, activeTab])

    function countEventsOnDate(dateStr: string) {
        return filteredAppointments.filter((a) => a.date === dateStr).length
    }

    const selectedDateStr = formatDate(selectedDate)
    const eventosDoDia = useMemo(() => {
        return filteredAppointments.filter((a) => a.date === selectedDateStr)
    }, [filteredAppointments, selectedDateStr])

    const convitesRecebidos = useMemo(() => {
        if (activeTab !== 'pessoal') return []
        return filteredAppointments.filter(
            (a) => a.direction === 'incoming' && a.status === 'pending'
        )
    }, [filteredAppointments, activeTab])

    const pendentesEnviados = useMemo(() => {
        if (activeTab !== 'pessoal') return []
        return appointments.filter(
            (a) =>
                a.owner_id === userId &&
                a.direction === 'incoming' &&
                a.status === 'pending'
        )
    }, [appointments, userId, activeTab])

    const aceitos = useMemo(() => {
        if (activeTab !== 'pessoal') return []
        return filteredAppointments.filter(
            (a) => a.direction === 'incoming' && a.status === 'confirmed'
        )
    }, [filteredAppointments, activeTab])

    const pendentesLoja = useMemo(() => {
        if (activeTab === 'pessoal') return []
        return filteredAppointments.filter((a) => a.status === 'pending')
    }, [filteredAppointments, activeTab])

    const confirmadosLoja = useMemo(() => {
        if (activeTab === 'pessoal') return []
        return filteredAppointments.filter((a) => a.status === 'confirmed')
    }, [filteredAppointments, activeTab])

    const proximosCompromissos = useMemo(() => {
        const now = new Date()
        const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const futuros = filteredAppointments.filter((a: Appointment) => {
            const appointmentDate = parseDate(a.date)
            if (appointmentDate < todayDate) return false
            if (appointmentDate.getTime() === todayDate.getTime()) {
                const [h, m] = a.time.split(':').map(Number)
                const appointmentDateTime = new Date(
                    appointmentDate.getFullYear(),
                    appointmentDate.getMonth(),
                    appointmentDate.getDate(),
                    h, m, 0, 0
                )
                if (appointmentDateTime < now) return false
            }
            if (!showPendingInNext && a.status === 'pending') return false
            return true
        })
        futuros.sort((a: Appointment, b: Appointment) => {
            const da = parseDate(a.date)
            const [aH, aM] = a.time.split(':').map(Number)
            da.setHours(aH, aM, 0, 0)
            const db = parseDate(b.date)
            const [bH, bM] = b.time.split(':').map(Number)
            db.setHours(bH, bM, 0, 0)
            return da.getTime() - db.getTime()
        })
        return futuros
    }, [filteredAppointments, showPendingInNext])

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
            return { date, dia: diasSemana[date.getDay()], numero: date.getDate(), count }
        })
    }, [selectedDate, filteredAppointments])

    const meses = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ]

    const diasDoMes = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const primeiroDia = new Date(calendarYear, calendarMonth, 1).getDay()
    const eventosDoMes = useMemo(() => {
        return filteredAppointments.filter((a: Appointment) => {
            const [ano, mes] = a.date.split('-').map(Number)
            return ano === calendarYear && mes === calendarMonth + 1
        })
    }, [filteredAppointments, calendarYear, calendarMonth])

    const maxAceitosVisiveis = 10
    const listaAceitos = activeTab === 'pessoal' ? aceitos : confirmadosLoja
    const aceitosExibidos = listaAceitos.slice(0, maxAceitosVisiveis)
    const hasMoreAceitos = listaAceitos.length > maxAceitosVisiveis

    const filteredAceitos = useMemo(() => {
        if (!acceptedSearch.trim()) return listaAceitos
        const q = acceptedSearch.toLowerCase()
        return listaAceitos.filter(
            (a: Appointment) =>
                a.service_name.toLowerCase().includes(q) ||
                (a.store_name || '').toLowerCase().includes(q) ||
                a.owner_slug.toLowerCase().includes(q)
        )
    }, [listaAceitos, acceptedSearch])

    const fetchParticipantsForAppointments = useCallback(async (appointmentsList: Appointment[]) => {
        if (!appointmentsList.length) return
        const idsToFetch = appointmentsList
            .map(app => app.id)
            .filter(id => !fetchedIdsRef.current.has(id))
        if (idsToFetch.length === 0) return
        idsToFetch.forEach(id => fetchedIdsRef.current.add(id))

        const groupsMap = new Map<string, { id: string; store_id: string | null; provider_profile_id: string | null; date: string; time: string }[]>()
        for (const app of appointmentsList) {
            if (!idsToFetch.includes(app.id)) continue
            let groupKey: string
            let storeId: string | null = null
            let providerId: string | null = null
            if (app.store_id) {
                groupKey = `store_${app.store_id}|${app.date}|${app.time}`
                storeId = app.store_id
            } else {
                const provider = app.provider_profile_id ?? null
                groupKey = `profile_${provider ?? 'null'}|${app.date}|${app.time}`
                providerId = provider
            }
            if (!groupsMap.has(groupKey)) groupsMap.set(groupKey, [])
            groupsMap.get(groupKey)!.push({
                id: app.id,
                store_id: storeId,
                provider_profile_id: providerId,
                date: app.date,
                time: app.time
            })
        }

        const newMap: Record<string, any[]> = {}
        for (const [_, groupApps] of groupsMap) {
            const first = groupApps[0]
            let query = supabase
                .from('appointments')
                .select('customer_id, customer_slug, status, direction')
                .eq('date', first.date)
                .eq('time', first.time)
            if (first.store_id) {
                query = query.eq('store_id', first.store_id)
            } else if (first.provider_profile_id) {
                query = query.eq('provider_profile_id', first.provider_profile_id)
            } else {
                continue
            }
            const { data } = await query
            let enriched: any[] = []
            if (data) {
                enriched = await Promise.all(
                    data.map(async (p) => {
                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('name, profileSlug, avatar_url')
                            .eq('profileSlug', p.customer_slug)
                            .maybeSingle()
                        return { ...p, profile }
                    })
                )
            }
            for (const app of groupApps) {
                newMap[app.id] = enriched
            }
        }
        if (Object.keys(newMap).length) {
            setParticipantsMap(prev => ({ ...prev, ...newMap }))
        }
    }, [])

    useEffect(() => {
        const allDisplayed = [...proximosCompromissos, ...aceitosExibidos]
        if (allDisplayed.length) {
            fetchParticipantsForAppointments(allDisplayed)
        }
    }, [proximosCompromissos, aceitosExibidos])

    const aceitarCompromisso = useCallback(async (appointmentId: string) => {
        const success = await updateStatus(appointmentId, 'confirmed')
        if (success) refetch()
    }, [updateStatus, refetch])

    const recusarCompromisso = useCallback(async (appointmentId: string) => {
        const success = await updateStatus(appointmentId, 'cancelled')
        if (success) refetch()
    }, [updateStatus, refetch])

    const handleDelete = useCallback(async (appointmentId: string) => {
        if (!confirm('Deseja realmente excluir este compromisso?')) return
        const success = await deleteAppointment(appointmentId)
        if (success) refetch()
    }, [deleteAppointment, refetch])

    const openDetailModal = async (appointment: Appointment) => {
        setSelectedAppointment(appointment)
        setAllowGuestInvites(false)
        setInviteSlugDetail('')
        setSearchedProfileDetail(null)
        setDetailModalOpen(true)

        if (userId) {
            let query = supabase
                .from('appointments')
                .select('customer_id, customer_slug, status, direction, is_public')
                .eq('date', appointment.date)
                .eq('time', appointment.time)
            if (appointment.store_id) {
                query = query.eq('store_id', appointment.store_id)
            } else {
                query = query.eq('provider_profile_id', appointment.provider_profile_id ?? null)
            }
            const { data } = await query
            if (data) {
                const enriched = await Promise.all(
                    data.map(async (p) => {
                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('name, profileSlug, avatar_url')
                            .eq('profileSlug', p.customer_slug)
                            .maybeSingle()
                        return { ...p, profile }
                    })
                )
                setParticipants(enriched)
            }
        }
    }

    const searchProfileForDetail = async () => {
        if (!inviteSlugDetail.trim()) return
        setSearchingDetail(true)
        setSearchedProfileDetail(null)
        const { data, error } = await supabase
            .from('profiles')
            .select('id, name, profileSlug, avatar_url')
            .eq('profileSlug', inviteSlugDetail.trim())
            .maybeSingle()
        if (error || !data) alert('Perfil não encontrado.')
        else setSearchedProfileDetail(data)
        setSearchingDetail(false)
    }

    const addInviteToAppointment = async () => {
        if (!selectedAppointment || !searchedProfileDetail || !userId) return
        const convite = {
            store_id: selectedAppointment.store_id,
            store_slug: selectedAppointment.store_slug,
            store_name: selectedAppointment.store_name,
            store_logo_url: selectedAppointment.store_logo_url,
            customer_id: searchedProfileDetail.id,
            customer_slug: searchedProfileDetail.profileSlug,
            customer_avatar_url: searchedProfileDetail.avatar_url || '',
            owner_id: userId,
            owner_slug: selectedAppointment.owner_slug,
            provider_profile_id: selectedAppointment.provider_profile_id ?? null,
            date: selectedAppointment.date,
            time: selectedAppointment.time,
            service_name: selectedAppointment.service_name,
            service_type: 'service',
            people_count: 1,
            status: 'pending',
            direction: 'incoming',
        }
        const { error } = await supabase.from('appointments').insert(convite)
        if (error) alert(`Erro ao convidar: ${error.message}`)
        else {
            alert(`Convite enviado para ${searchedProfileDetail.name}!`)
            setSearchedProfileDetail(null)
            setInviteSlugDetail('')
            refetch()
            openDetailModal(selectedAppointment)
        }
    }

    // Helpers de URL pública
    const getPublicUrl = (path: string | null | undefined, bucket: 'store-logos' | 'avatars'): string | null => {
        if (!path) return null
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) return path
        const { data } = supabase.storage.from(bucket).getPublicUrl(path)
        return data?.publicUrl || null
    }

    // Imagem de fundo do header
    const headerImageUrl = useMemo(() => {
        if (activeTab === 'pessoal') {
            return userAvatarUrl ? getPublicUrl(userAvatarUrl, 'avatars') : null
        } else {
            const store = myStores.find(s => s.id === activeTab)
            return store?.logo_url ? getPublicUrl(store.logo_url, 'store-logos') : null
        }
    }, [activeTab, userAvatarUrl, myStores])

    // Abas com imagem/ícone
    const tabs = useMemo(() => {
        const personalTab = {
            id: 'pessoal',
            label: 'Pessoal',
            icon: User,
            imageUrl: userAvatarUrl ? getPublicUrl(userAvatarUrl, 'avatars') : null,
        }
        const storeTabs = myStores.map((store) => ({
            id: store.id,
            label: store.name,
            icon: Store,
            imageUrl: store.logo_url ? getPublicUrl(store.logo_url, 'store-logos') : null,
        }))
        return [personalTab, ...storeTabs]
    }, [userAvatarUrl, myStores])

    const activeStoreName = activeTab === 'pessoal' ? 'Agenda pessoal' : myStores.find((s) => s.id === activeTab)?.name || 'Loja'

    const getAvatarType = (appointment: Appointment): 'store' | 'personal' | 'invite' => {
        if (appointment.store_id) {
            if (userId && appointment.customer_id === userId) {
                return 'store'
            } else {
                return 'invite'
            }
        }
        if (appointment.direction) return 'invite'
        return 'personal'
    }

    const getAvatarUrl = (appointment: Appointment, type: 'store' | 'personal' | 'invite'): string | null => {
        if (type === 'store') return getPublicUrl(appointment.store_logo_url, 'store-logos')
        if (type === 'invite') return getPublicUrl(appointment.customer_avatar_url, 'avatars')
        return getPublicUrl(userAvatarUrl, 'avatars')
    }

    // Renderização principal
    return (
        <main style={{ minHeight: '100vh', background: '#000', paddingBottom: 120, position: 'relative' }}>
            <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            {loading ? (
                <div className="min-h-screen flex items-center justify-center relative z-10">
                    <p className="text-white/70">Carregando agenda...</p>
                </div>
            ) : error ? (
                <div className="min-h-screen flex items-center justify-center flex-col gap-4 relative z-10">
                    <p className="text-red-400">Erro ao carregar: {error}</p>
                    <button onClick={refetch} className="text-purple-400 underline">Tentar novamente</button>
                </div>
            ) : (
                <div className="relative z-10">
                    {/* HEADER ESTILO INICIO */}
                    <div style={{
                        background: 'linear-gradient(135deg, #000, #000)',
                        padding: '20px 24px',
                        color: '#fff',
                        borderBottomLeftRadius: 36,
                        borderBottomRightRadius: 36,
                        boxShadow: '0 10px 40px rgba(255,255,255,0.15)',
                        position: 'relative',
                        overflow: 'hidden',
                    }}>
                        {/* Imagem decorativa à direita */}
                        <div style={{
                            position: 'absolute',
                            right: -30,
                            top: -30,
                            opacity: 0.4,
                            transform: 'rotate(10deg)',
                            maskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                            WebkitMaskImage: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 30%, rgba(0,0,0,0) 70%)',
                        }}>
                            {headerImageUrl ? (
                                <img src={headerImageUrl} alt="" style={{ width: 280, height: 280, objectFit: 'cover' }} />
                            ) : (
                                <img src="/logotransparente.png" alt="" style={{ width: 280, height: 280, objectFit: 'contain' }} />
                            )}
                        </div>

                        <div className="relative z-10">
                            {/* Linha topo com botão voltar */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <button onClick={() => router.back()} style={{
                                    background: 'rgba(255,255,255,0.15)',
                                    border: 'none',
                                    borderRadius: 14,
                                    width: 42,
                                    height: 42,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', backdropFilter: 'blur(10px)',
                                }}>
                                    <ChevronLeft size={24} color="#fff" />
                                </button>
                                <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0, opacity: 0.9 }}>Compromissos</h2>
                            </div>

                            {/* Título */}
                            <h1 style={{ fontSize: 32, fontWeight: 800, marginTop: 12, letterSpacing: '-0.5px' }}>{activeStoreName}</h1>

                            {/* Abas */}
                            <div style={{ display: 'flex', gap: 8, marginTop: 20, overflowX: 'auto', paddingBottom: 4 }}>
                                {tabs.map((tab) => {
                                    const isActive = activeTab === tab.id
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                padding: '8px 16px',
                                                borderRadius: 20,
                                                border: 'none',
                                                background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                                                color: '#fff',
                                                fontWeight: isActive ? 800 : 600,
                                                fontSize: 14,
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap',
                                                backdropFilter: 'blur(10px)',
                                                transition: 'all 0.2s',
                                            }}
                                        >
                                            {tab.imageUrl ? (
                                                <img
                                                    src={tab.imageUrl}
                                                    alt={tab.label}
                                                    style={{
                                                        width: 20,
                                                        height: 20,
                                                        borderRadius: '50%',
                                                        objectFit: 'cover',
                                                    }}
                                                />
                                            ) : (
                                                <tab.icon size={16} />
                                            )}
                                            {tab.label}
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Barra de busca */}
                            <div style={{
                                marginTop: 16,
                                background: 'rgba(255,255,255,0.1)',
                                borderRadius: 20,
                                padding: 14,
                                display: 'flex',
                                gap: 10,
                                alignItems: 'center',
                                backdropFilter: 'blur(10px)',
                            }}>
                                <Search size={18} opacity={0.7} />
                                <span style={{ opacity: 0.7 }}>Buscar compromissos...</span>
                            </div>
                        </div>
                    </div>

                    {/* CONTEÚDO PRINCIPAL */}
                    <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 28 }}>
                        {/* PRÓXIMOS COMPROMISSOS */}
                        <section>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                <h2 style={{ fontWeight: 800, fontSize: 22, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <ListChecks size={22} color="#a78bfa" /> Próximos Compromissos
                                </h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>Mostrar pendentes</span>
                                    <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24 }}>
                                        <input type="checkbox" checked={showPendingInNext} onChange={(e) => setShowPendingInNext(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                                        <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: showPendingInNext ? '#7c3aed' : '#475569', borderRadius: 24, transition: '0.3s' }}>
                                            <span style={{ position: 'absolute', height: 18, width: 18, left: showPendingInNext ? 23 : 3, bottom: 3, backgroundColor: 'white', transition: '0.3s', borderRadius: '50%' }} />
                                        </span>
                                    </label>
                                </div>
                            </div>
                            {proximosCompromissos.length === 0 ? (
                                <div style={{
                                    background: 'rgba(255,255,255,0.06)',
                                    borderRadius: 24,
                                    padding: 28,
                                    textAlign: 'center',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#94a3b8',
                                    backdropFilter: 'blur(10px)',
                                }}>
                                    Nenhum compromisso futuro.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {proximosCompromissos.map((comp, idx) => {
                                        const isFirst = idx === 0
                                        const remaining = getTimeRemaining(comp.date, comp.time)
                                        const avatarType = getAvatarType(comp)
                                        const avatarUrl = getAvatarUrl(comp, avatarType)
                                        const compParticipants = participantsMap[comp.id] || []
                                        const displayDate = parseDate(comp.date).toLocaleDateString('pt-BR')
                                        return (
                                            <div key={comp.id} onClick={() => openDetailModal(comp)} style={{
                                                background: isFirst ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.06)',
                                                borderRadius: 20, padding: 16, display: 'flex', alignItems: 'center', gap: 16,
                                                boxShadow: isFirst ? '0 8px 25px rgba(124,58,237,0.3)' : '0 2px 10px rgba(0,0,0,0.2)',
                                                border: isFirst ? '2px solid #7c3aed' : '1px solid rgba(255,255,255,0.1)',
                                                position: 'relative', cursor: 'pointer', transition: 'all 0.2s',
                                                backdropFilter: 'blur(10px)',
                                            }}>
                                                {isFirst && <div style={{ position: 'absolute', top: -10, left: -10, background: '#7c3aed', borderRadius: 20, padding: '2px 10px', color: '#fff', fontWeight: 700, fontSize: 12, boxShadow: '0 4px 10px rgba(124,58,237,0.5)' }}>{remaining}</div>}
                                                <AppointmentAvatar url={avatarUrl} name={avatarType === 'store' ? comp.store_name || 'Loja' : avatarType === 'invite' ? 'Convite' : 'Pessoal'} type={avatarType} size={56} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                                <h3 style={{ fontWeight: 800, fontSize: 17, color: isFirst ? '#c084fc' : '#fff' }}>{comp.service_name}</h3>
                                                                {comp.is_public !== undefined && <VisibilityBadge isPublic={comp.is_public} />}
                                                                <span style={{ fontSize: 10, fontWeight: 700, background: comp.status === 'confirmed' ? 'rgba(16,185,129,0.2)' : 'rgba(234,179,8,0.2)', color: comp.status === 'confirmed' ? '#10b981' : '#facc15', padding: '2px 8px', borderRadius: 12 }}>
                                                                    {comp.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                                                                </span>
                                                            </div>
                                                            <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                {avatarType === 'store' && <><Store size={12} /> {comp.store_name}</>}
                                                                {avatarType === 'invite' && <><User size={12} /> Convite</>}
                                                                {avatarType === 'personal' && <><Lock size={12} /> Compromisso pessoal</>}
                                                            </p>
                                                            <ParticipantsMini participants={compParticipants} />
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <p style={{ fontWeight: 700, fontSize: 18, color: isFirst ? '#c084fc' : '#e2e8f0' }}>{formatTime(comp.time)}</p>
                                                            <p style={{ fontSize: 12, color: '#94a3b8' }}>{displayDate}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </section>

                        {/* CALENDÁRIO */}
                        <section>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <h2 style={{ fontWeight: 700, fontSize: 20, display: 'flex', alignItems: 'center', gap: 6, color: '#fff' }}>
                                    <LayoutGrid size={20} color="#a78bfa" /> {meses[selectedDate.getMonth()]} {selectedDate.getFullYear()}
                                </h2>
                                <button onClick={() => setCalendarOpen(true)} style={{
                                    background: '#7c3aed',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 14,
                                    padding: '10px 16px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: 14,
                                    boxShadow: '0 4px 15px rgba(124,58,237,0.3)',
                                }}>
                                    Ver calendário
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                                {diasHorizontais.map((item) => {
                                    const ativo = item.date.toDateString() === selectedDate.toDateString()
                                    return (
                                        <button key={item.numero} onClick={() => setSelectedDate(item.date)} style={{
                                            minWidth: 72, border: 'none',
                                            background: ativo ? '#7c3aed' : 'rgba(255,255,255,0.1)',
                                            color: ativo ? '#fff' : '#fff',
                                            borderRadius: 20, padding: 14,
                                            boxShadow: ativo ? '0 8px 20px rgba(124,58,237,0.3)' : '0 2px 8px rgba(0,0,0,0.2)',
                                            cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
                                            backdropFilter: 'blur(10px)',
                                        }}>
                                            <p style={{ fontSize: 12, fontWeight: 600 }}>{item.dia}</p>
                                            <h3 style={{ fontSize: 22, fontWeight: 800 }}>{item.numero}</h3>
                                            {item.count > 0 && <div style={{ position: 'absolute', top: 6, right: 6, background: '#a855f7', color: '#fff', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, boxShadow: '0 2px 6px rgba(168,85,247,0.5)' }}>{item.count}</div>}
                                        </button>
                                    )
                                })}
                            </div>
                        </section>

                        {/* CALENDÁRIO POPUP */}
                        {calendarOpen && (
                            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                                <div style={{ width: '100%', maxWidth: 500, background: '#1e1e2e', borderRadius: 28, padding: 24, maxHeight: '85vh', overflowY: 'auto', color: '#fff', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Calendário</h2>
                                        <button onClick={() => setCalendarOpen(false)} style={{ border: 'none', background: 'rgba(255,255,255,0.1)', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', color: '#fff' }}>✕</button>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                        <button onClick={() => { if (calendarYear > 2026) setCalendarYear((prev) => prev - 1) }} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>«</button>
                                        <button onClick={() => { if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear((prev) => prev - 1) } else setCalendarMonth((prev) => prev - 1) }} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><ChevronLeft /></button>
                                        <strong>{meses[calendarMonth]} {calendarYear}</strong>
                                        <button onClick={() => { if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear((prev) => prev + 1) } else setCalendarMonth((prev) => prev + 1) }} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}><ChevronRight /></button>
                                        <button onClick={() => { if (calendarYear < 2028) setCalendarYear((prev) => prev + 1) }} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>»</button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8, marginBottom: 12 }}>
                                        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((dia, idx) => (
                                            <div key={`${dia}-${idx}`} style={{ textAlign: 'center', fontWeight: 700 }}>{dia}</div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
                                        {Array.from({ length: primeiroDia }).map((_, index) => <div key={`empty-${index}`} />)}
                                        {Array.from({ length: diasDoMes }).map((_, index) => {
                                            const dia = index + 1
                                            const date = new Date(calendarYear, calendarMonth, dia)
                                            const dateStr = formatDate(date)
                                            const count = countEventsOnDate(dateStr)
                                            const ativo = date.toDateString() === selectedDate.toDateString()
                                            return (
                                                <button
                                                    key={`day-${dia}`}
                                                    onClick={() => { setSelectedDate(date); setCalendarOpen(false) }}
                                                    style={{
                                                        height: 42,
                                                        border: 'none',
                                                        borderRadius: 12,
                                                        background: ativo ? '#7c3aed' : 'rgba(255,255,255,0.1)',
                                                        color: '#fff',
                                                        cursor: 'pointer',
                                                        position: 'relative',
                                                    }}
                                                >
                                                    {dia}
                                                    {count > 0 && (
                                                        <div style={{ position: 'absolute', top: -4, right: -4, background: '#a855f7', color: '#fff', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, boxShadow: '0 2px 6px rgba(168,85,247,.4)' }}>
                                                            {count}
                                                        </div>
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <div style={{ marginTop: 24 }}>
                                        <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>Agendamentos de {meses[calendarMonth]} {calendarYear}</h3>
                                        {eventosDoMes.length === 0 ? <p style={{ color: '#94a3b8', textAlign: 'center' }}>Nenhum agendamento neste mês</p> : eventosDoMes.map((evento) => {
                                            const avatarType = getAvatarType(evento)
                                            const avatarUrl = getAvatarUrl(evento, avatarType)
                                            return (
                                                <div key={evento.id} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 16, marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center', backdropFilter: 'blur(10px)' }}>
                                                    <AppointmentAvatar url={avatarUrl} name={avatarType === 'store' ? evento.store_name || 'Loja' : avatarType === 'invite' ? 'Convite' : 'Pessoal'} type={avatarType} size={56} />
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <h4 style={{ fontWeight: 800, fontSize: 16 }}>{evento.service_name}</h4>
                                                                {evento.is_public !== undefined && <VisibilityBadge isPublic={evento.is_public} />}
                                                            </div>
                                                            <span style={{ fontWeight: 700, color: evento.status === 'confirmed' ? '#10b981' : '#facc15' }}>{evento.status === 'confirmed' ? 'Confirmado' : 'Pendente'}</span>
                                                        </div>
                                                        <p style={{ color: '#94a3b8', marginTop: 2 }}>{avatarType === 'store' ? evento.store_name : avatarType === 'invite' ? 'Convite' : 'Compromisso pessoal'}</p>
                                                        <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center', color: '#94a3b8' }}>
                                                            <Clock3 size={14} />
                                                            <span>{evento.date.split('-').reverse().join('/')} • {formatTime(evento.time)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* AGENDA DO DIA */}
                        <section>
                            <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 12, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Clock3 size={22} color="#a78bfa" /> Agenda • {selectedDate.toLocaleDateString('pt-BR')}
                            </h2>
                            {eventosDoDia.length === 0 ? (
                                <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 24, padding: 24, textAlign: 'center', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>Nenhum agendamento para este dia.</div>
                            ) : (
                                eventosDoDia.map((evento) => {
                                    const avatarType = getAvatarType(evento)
                                    const avatarUrl = getAvatarUrl(evento, avatarType)
                                    return (
                                        <div key={evento.id} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 24, padding: 16, marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <AppointmentAvatar url={avatarUrl} name={avatarType === 'store' ? evento.store_name || 'Loja' : avatarType === 'invite' ? 'Convite' : 'Pessoal'} type={avatarType} size={64} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                    <h3 style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>{evento.service_name}</h3>
                                                    {evento.is_public !== undefined && <VisibilityBadge isPublic={evento.is_public} />}
                                                </div>
                                                <p style={{ color: '#94a3b8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    {avatarType === 'store' && <><Store size={14} /> {evento.store_name}</>}
                                                    {avatarType === 'invite' && <><User size={14} /> Convite</>}
                                                    {avatarType === 'personal' && <><Lock size={14} /> Compromisso pessoal</>}
                                                </p>
                                                <div style={{ fontSize: 20, fontWeight: 800, color: '#c084fc', marginBottom: 8 }}>{formatTime(evento.time)}</div>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    {evento.status === 'confirmed' && <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={16} color="#fff" /></div>}
                                                    {evento.status === 'pending' && <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#facc15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Clock3 size={16} color="#000" /></div>}
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(evento.id) }} style={{ width: 32, height: 32, borderRadius: '50%', background: '#ef4444', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Trash2 size={16} color="#fff" /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); openDetailModal(evento) }} style={{ width: 32, height: 32, borderRadius: '50%', background: '#7c3aed', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Edit3 size={16} color="#fff" /></button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </section>

                        {/* CONVITES (apenas na aba Pessoal) */}
                        {activeTab === 'pessoal' && (
                            <section>
                                <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
                                    <Bell size={22} color="#a78bfa" /> Convites
                                </h2>
                                {convitesRecebidos.length === 0 ? (
                                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 24, padding: 20, color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>Nenhum convite pendente.</div>
                                ) : (
                                    convitesRecebidos.map((convite) => {
                                        const avatarType = getAvatarType(convite)
                                        const avatarUrl = getAvatarUrl(convite, avatarType)
                                        return (
                                            <div key={convite.id} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 24, padding: 16, marginBottom: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                                                <div style={{ display: 'flex', gap: 16 }}>
                                                    <AppointmentAvatar url={avatarUrl} name={avatarType === 'store' ? convite.store_name || 'Loja' : 'Convite'} type={avatarType === 'store' ? 'store' : 'invite'} size={56} />
                                                    <div style={{ flex: 1 }}>
                                                        <h3 style={{ fontWeight: 800, color: '#fff' }}>{convite.service_name}</h3>
                                                        <p style={{ marginTop: 4, fontSize: 14, color: '#94a3b8' }}>de <SenderName ownerSlug={convite.owner_slug} /></p>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', marginTop: 4 }}>
                                                            <Clock3 size={14} />
                                                            <span>{convite.date.split('-').reverse().join('/')} • {formatTime(convite.time)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
                                                    <button onClick={() => aceitarCompromisso(convite.id)} style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', borderRadius: 14, padding: '10px 14px', fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}><Check size={16} /> Aceitar</button>
                                                    <button onClick={() => recusarCompromisso(convite.id)} style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 14, padding: '10px 14px', fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}><X size={16} /> Recusar</button>
                                                    <button onClick={(e) => { e.stopPropagation(); openDetailModal(convite) }} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 14, padding: '10px 14px', fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}><Eye size={16} /> Detalhes</button>
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </section>
                        )}

                        {/* PENDENTES DA LOJA */}
                        {activeTab !== 'pessoal' && (
                            <section>
                                <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
                                    <Bell size={22} color="#f97316" /> Pendentes
                                </h2>
                                {pendentesLoja.length === 0 ? (
                                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 24, padding: 20, color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>Nenhum agendamento pendente.</div>
                                ) : (
                                    pendentesLoja.map((agendamento) => (
                                        <div key={agendamento.id} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 24, padding: 16, marginBottom: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                                            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                                <AppointmentAvatar url={agendamento.store_logo_url ?? null} name={agendamento.store_name || 'Loja'} type="store" size={56} />
                                                <div style={{ flex: 1 }}>
                                                    <h3 style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>{agendamento.service_name}</h3>
                                                    <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 2 }}>Cliente: @{agendamento.customer_slug}</p>
                                                    <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center', color: '#94a3b8' }}>
                                                        <Clock3 size={14} />
                                                        <span>{agendamento.date.split('-').reverse().join('/')} • {formatTime(agendamento.time)}</span>
                                                    </div>
                                                </div>
                                                <span style={{ background: 'rgba(234,179,8,0.2)', color: '#facc15', padding: '4px 12px', borderRadius: 12, fontWeight: 700, fontSize: 12 }}>Pendente</span>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                                <button onClick={() => aceitarCompromisso(agendamento.id)} style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', borderRadius: 14, padding: '10px 14px', fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}><Check size={16} /> Aceitar</button>
                                                <button onClick={() => recusarCompromisso(agendamento.id)} style={{ flex: 1, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 14, padding: '10px 14px', fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}><X size={16} /> Recusar</button>
                                                <button onClick={() => openDetailModal(agendamento)} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 14, padding: '10px 14px', fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}><Eye size={16} /> Detalhes</button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </section>
                        )}

                        {/* ACEITOS / CONFIRMADOS */}
                        <section>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <h2 style={{ fontWeight: 800, fontSize: 22, display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
                                    <UserCheck size={22} color="#a78bfa" /> {activeTab === 'pessoal' ? 'Aceitos' : 'Confirmados'}
                                </h2>
                                {hasMoreAceitos && <button onClick={() => setShowAllAcceptedModal(true)} style={{ border: 'none', background: 'transparent', color: '#a78bfa', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>Ver todos ({listaAceitos.length})</button>}
                            </div>
                            {listaAceitos.length === 0 ? (
                                <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 24, padding: 20, color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>{activeTab === 'pessoal' ? 'Nenhum convite aceito.' : 'Nenhum agendamento confirmado.'}</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {aceitosExibidos.map((item) => {
                                        const avatarType = getAvatarType(item)
                                        const avatarUrl = getAvatarUrl(item, avatarType)
                                        const itemParticipants = participantsMap[item.id] || []
                                        const displayDate = parseDate(item.date).toLocaleDateString('pt-BR')
                                        return (
                                            <div key={item.id} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 24, padding: 16, display: 'flex', gap: 16, alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                                                <AppointmentAvatar url={avatarUrl} name={avatarType === 'store' ? item.store_name || 'Loja' : avatarType === 'invite' ? 'Convite' : 'Pessoal'} type={avatarType} size={56} />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <h3 style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>{item.service_name}</h3>
                                                        {item.is_public !== undefined && <VisibilityBadge isPublic={item.is_public} />}
                                                    </div>
                                                    <p style={{ color: '#94a3b8', marginTop: 4 }}>{avatarType === 'store' ? item.store_name : avatarType === 'invite' ? 'Convite' : 'Compromisso pessoal'}</p>
                                                    <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center', color: '#94a3b8' }}>
                                                        <Clock3 size={16} />
                                                        <span>{displayDate} • {formatTime(item.time)}</span>
                                                    </div>
                                                    <ParticipantsMini participants={itemParticipants} />
                                                </div>
                                                <span style={{ background: 'rgba(16,185,129,0.2)', color: '#10b981', padding: '4px 12px', borderRadius: 12, fontWeight: 700, fontSize: 12 }}>Confirmado</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* MODAL DE PENDENTES (convites enviados) */}
                    {showPendentesModal && activeTab === 'pessoal' && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                            <div style={{ width: '100%', maxWidth: 500, background: '#1e1e2e', borderRadius: 28, padding: 24, maxHeight: '85vh', overflowY: 'auto', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <h2 style={{ fontSize: 22, fontWeight: 800 }}>Convites Pendentes</h2>
                                    <button onClick={() => setShowPendentesModal(false)} style={{ border: 'none', background: 'rgba(255,255,255,0.1)', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', color: '#fff' }}>✕</button>
                                </div>
                                {pendentesEnviados.length === 0 ? <p style={{ color: '#94a3b8', textAlign: 'center' }}>Nenhum convite enviado pendente.</p> : pendentesEnviados.map((convite) => {
                                    const avatarType = getAvatarType(convite)
                                    const avatarUrl = getAvatarUrl(convite, avatarType)
                                    return (
                                        <div key={convite.id} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 16, marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <AppointmentAvatar url={avatarUrl} name={avatarType === 'store' ? convite.store_name || 'Loja' : 'Convite'} type={avatarType === 'store' ? 'store' : 'invite'} size={56} />
                                            <div style={{ flex: 1 }}>
                                                <h4 style={{ fontWeight: 800, fontSize: 16 }}>{convite.service_name}</h4>
                                                <p style={{ color: '#94a3b8', marginTop: 2 }}>Para: @{convite.customer_slug}</p>
                                                <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center', color: '#94a3b8' }}>
                                                    <Clock3 size={14} />
                                                    <span>{convite.date.split('-').reverse().join('/')} • {formatTime(convite.time)}</span>
                                                </div>
                                            </div>
                                            <button onClick={() => { handleDelete(convite.id); setShowPendentesModal(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={20} /></button>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* MODAL DE TODOS OS ACEITOS */}
                    {showAllAcceptedModal && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                            <div style={{ width: '100%', maxWidth: 500, background: '#1e1e2e', borderRadius: 28, padding: 24, maxHeight: '85vh', overflowY: 'auto', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <h2 style={{ fontSize: 22, fontWeight: 800 }}>Todos os {activeTab === 'pessoal' ? 'Aceitos' : 'Confirmados'} ({listaAceitos.length})</h2>
                                    <button onClick={() => { setShowAllAcceptedModal(false); setAcceptedSearch('') }} style={{ border: 'none', background: 'rgba(255,255,255,0.1)', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', color: '#fff' }}>✕</button>
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                        <input type="text" value={acceptedSearch} onChange={(e) => setAcceptedSearch(e.target.value)} placeholder="Buscar por nome ou compromisso..." style={{ width: '100%', padding: '12px 16px 12px 40px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.2)', fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff' }} />
                                    </div>
                                </div>
                                {filteredAceitos.length === 0 ? <p style={{ color: '#94a3b8', textAlign: 'center' }}>Nenhum encontrado.</p> : filteredAceitos.map((item) => {
                                    const avatarType = getAvatarType(item)
                                    const avatarUrl = getAvatarUrl(item, avatarType)
                                    const displayDate = parseDate(item.date).toLocaleDateString('pt-BR')
                                    return (
                                        <div key={item.id} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 16, marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <AppointmentAvatar url={avatarUrl} name={avatarType === 'store' ? item.store_name || 'Loja' : avatarType === 'invite' ? 'Convite' : 'Pessoal'} type={avatarType} size={56} />
                                            <div style={{ flex: 1 }}>
                                                <h4 style={{ fontWeight: 800, fontSize: 16 }}>{item.service_name}</h4>
                                                <p style={{ color: '#94a3b8', marginTop: 2 }}>{avatarType === 'store' ? item.store_name : avatarType === 'invite' ? 'Convite' : 'Compromisso pessoal'}</p>
                                                <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center', color: '#94a3b8' }}>
                                                    <Clock3 size={14} />
                                                    <span>{displayDate} • {formatTime(item.time)}</span>
                                                </div>
                                            </div>
                                            <span style={{ background: 'rgba(16,185,129,0.2)', color: '#10b981', padding: '4px 12px', borderRadius: 12, fontWeight: 700, fontSize: 12 }}>Confirmado</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {/* MODAL DE DETALHES */}
                    {detailModalOpen && selectedAppointment && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                            <div style={{ width: '100%', maxWidth: 500, background: '#1e1e2e', borderRadius: 28, padding: 24, maxHeight: '85vh', overflowY: 'auto', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>Detalhes</h2>
                                    <button onClick={() => setDetailModalOpen(false)} style={{ border: 'none', background: 'rgba(255,255,255,0.1)', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', color: '#fff' }}>✕</button>
                                </div>
                                <div style={{ display: 'flex', gap: 16, marginBottom: 24, alignItems: 'center' }}>
                                    <AppointmentAvatar
                                        url={getAvatarUrl(selectedAppointment, getAvatarType(selectedAppointment))}
                                        name={!selectedAppointment.store_id ? (selectedAppointment.direction ? 'Convite' : 'Pessoal') : selectedAppointment.store_name || 'Loja'}
                                        type={getAvatarType(selectedAppointment)}
                                        size={64}
                                    />
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <h3 style={{ fontWeight: 800, fontSize: 20, color: '#fff' }}>{selectedAppointment.service_name}</h3>
                                            {selectedAppointment.is_public !== undefined && <VisibilityBadge isPublic={selectedAppointment.is_public} />}
                                        </div>
                                        <p style={{ color: '#94a3b8', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {!selectedAppointment.store_id ? (selectedAppointment.direction ? <><User size={14} /> Convite</> : <><Lock size={14} /> Compromisso pessoal</>) : <><Store size={14} /> {selectedAppointment.store_name}</>}
                                        </p>
                                        <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 14, color: '#94a3b8' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={14} /> {new Date(selectedAppointment.date).toLocaleDateString('pt-BR')}</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock3 size={14} /> {formatTime(selectedAppointment.time)}</span>
                                        </div>
                                        <span style={{ marginTop: 8, display: 'inline-block', padding: '4px 12px', borderRadius: 12, background: selectedAppointment.status === 'confirmed' ? 'rgba(16,185,129,0.2)' : 'rgba(234,179,8,0.2)', color: selectedAppointment.status === 'confirmed' ? '#10b981' : '#facc15', fontWeight: 700, fontSize: 12 }}>
                                            {selectedAppointment.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 20, marginBottom: 20 }}>
                                    <h4 style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#a78bfa' }}><Users size={18} /> Participantes</h4>
                                    {participants.length === 0 ? <p style={{ color: '#94a3b8', fontSize: 14 }}>Nenhum participante encontrado.</p> : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {participants.map((p, i) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.06)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
                                                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff', fontSize: 14 }}>
                                                        {p.profile?.name?.charAt(0)?.toUpperCase() || p.customer_slug?.charAt(0)?.toUpperCase() || '?'}
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <p style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>{p.profile?.name || p.customer_slug}</p>
                                                        <p style={{ fontSize: 12, color: '#94a3b8' }}>@{p.customer_slug}</p>
                                                    </div>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: p.status === 'confirmed' ? '#10b981' : '#facc15' }}>
                                                        {p.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 20 }}>
                                    <h4 style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#a78bfa' }}><UserPlus size={18} /> Convidar mais pessoas</h4>
                                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                                        <input type="text" value={inviteSlugDetail} onChange={(e) => { setInviteSlugDetail(e.target.value); setSearchedProfileDetail(null) }} placeholder="Digite o @usuario" style={{ flex: 1, padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.2)', fontSize: 14, outline: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff' }} onKeyDown={(e) => e.key === 'Enter' && searchProfileForDetail()} />
                                        <button onClick={searchProfileForDetail} disabled={searchingDetail || !inviteSlugDetail.trim()} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 14, padding: '0 18px', fontWeight: 700, cursor: 'pointer' }}><Search size={16} /></button>
                                    </div>
                                    {searchedProfileDetail && (
                                        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 12, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#fff' }}>{searchedProfileDetail.name?.charAt(0)?.toUpperCase() || '?'}</div>
                                            <div style={{ flex: 1 }}>
                                                <p style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{searchedProfileDetail.name}</p>
                                                <p style={{ color: '#a78bfa', fontSize: 12 }}>@{searchedProfileDetail.profileSlug}</p>
                                            </div>
                                            <button onClick={() => { setSearchedProfileDetail(null); setInviteSlugDetail('') }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
                                            <button onClick={addInviteToAppointment} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 12, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Convidar</button>
                                        </div>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}><Settings size={18} /><span style={{ fontSize: 14 }}>Permitir que convidados adicionem pessoas</span></div>
                                        <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26 }}>
                                            <input type="checkbox" checked={allowGuestInvites} onChange={(e) => setAllowGuestInvites(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                                            <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: allowGuestInvites ? '#7c3aed' : '#475569', borderRadius: 26, transition: '0.3s' }}>
                                                <span style={{ position: 'absolute', height: 20, width: 20, left: allowGuestInvites ? 24 : 3, bottom: 3, backgroundColor: 'white', transition: '0.3s', borderRadius: '50%' }} />
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* MODAL DE HORÁRIOS */}
                    {userId && (
                        <HorarioEDisponibilidade
                            isOpen={showSettingsModal}
                            onClose={() => setShowSettingsModal(false)}
                            userId={userId}
                            activeTab={activeTab}
                            onSaved={() => refetch()}
                        />
                    )}

                    {/* BOTÃO FLUTUANTE: HORÁRIOS */}
                    {userId && (
                        <button
                            onClick={() => setShowSettingsModal(true)}
                            style={{
                                position: 'fixed',
                                bottom: 32,
                                left: 24,
                                background: '#fff',
                                color: '#7c3aed',
                                border: '2px solid #7c3aed',
                                borderRadius: 32,
                                padding: '12px 20px',
                                fontWeight: 700,
                                fontSize: 15,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                boxShadow: '0 8px 24px rgba(124,58,237,0.25)',
                                cursor: 'pointer',
                                zIndex: 998,
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#7c3aed'
                                e.currentTarget.style.color = '#fff'
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#fff'
                                e.currentTarget.style.color = '#7c3aed'
                            }}
                        >
                            <Settings size={18} /> Horários
                        </button>
                    )}

                    {/* BOTÃO FLUTUANTE: AGENDAR */}
                    <button onClick={() => router.push('/compromissos/agendar')} style={{ position: 'fixed', bottom: 32, right: 24, background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff', border: 'none', borderRadius: 32, padding: '16px 28px', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 12px 40px rgba(124,58,237,0.5)', cursor: 'pointer', zIndex: 998, transition: 'transform 0.2s' }} onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')} onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
                        <Plus size={24} /> Agendar
                    </button>
                </div>
            )}
        </main>
    )
}