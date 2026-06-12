// app/(main)/compromissos/agendar/CriarCompromissoLoja.tsx
'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
    ArrowLeft,
    Calendar,
    Clock,
    Check,
    ChevronLeft,
    ChevronRight,
    Search,
    X,
    Store,
    ShoppingBag,
    Edit3,
    Lock,
    Earth,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAppointments } from '../dadosDoCompromisso'
import AnimatedBackground from '@/components/AnimatedBackground'

/* ============= HELPERS ============= */
function toMinutes(timeStr: string): number { const [h, m] = timeStr.split(':').map(Number); return h * 60 + m }
function fromMinutes(minutes: number): string { const h = Math.floor(minutes / 60); const m = minutes % 60; return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}` }
const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
function pad(n: number) { return n.toString().padStart(2, '0') }

interface SearchTarget { id: string; name: string; slug: string; logo_url: string | null; owner_id?: string }
interface Product { id: string; name: string; description?: string; price?: number }

function getPublicLogoUrl(logoUrl: string | null | undefined): string | null {
    if (!logoUrl) return null
    if (logoUrl.startsWith('http')) return logoUrl
    const { data } = supabase.storage.from('stores').getPublicUrl(logoUrl)
    return data?.publicUrl || null
}

interface Props { onBack: () => void }

export default function CriarCompromissoLoja({ onBack }: Props) {
    const { appointments, refetch } = useAppointments()

    const [step, setStep] = useState<'search' | 'datetime' | 'confirm'>('search')
    const [target, setTarget] = useState<SearchTarget | null>(null)
    const [selectedDate, setSelectedDate] = useState<Date | null>(null)
    const [selectedTime, setSelectedTime] = useState<string | null>(null)
    const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
    const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
    const [submitting, setSubmitting] = useState(false)

    const [selectedDuration, setSelectedDuration] = useState<number>(60)
    const [scheduleConfig, setScheduleConfig] = useState<any>(null)
    const [userId, setUserId] = useState<string | null>(null)

    const [searchQuery, setSearchQuery] = useState('')
    const [results, setResults] = useState<SearchTarget[]>([])
    const [searching, setSearching] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)
    const searchInputRef = useRef<HTMLInputElement>(null)
    const [brokenImgIds, setBrokenImgIds] = useState<Set<string>>(new Set())
    const [targetImgError, setTargetImgError] = useState(false)

    const [appointmentNote, setAppointmentNote] = useState('')
    const [isPublic, setIsPublic] = useState(false)

    const [showProducts, setShowProducts] = useState(false)
    const [storeProducts, setStoreProducts] = useState<Product[]>([])
    const [loadingProducts, setLoadingProducts] = useState(false)
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [isEditingNote, setIsEditingNote] = useState(false)

    const hoje = new Date()
    const todayStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`

    useEffect(() => { supabase.auth.getSession().then(({ data: { session } }) => { if (session?.user) setUserId(session.user.id) }) }, [])
    useEffect(() => { if (target) { supabase.from('stores').select('opening_hours').eq('id', target.id).single().then(({ data }) => { if (data?.opening_hours) setScheduleConfig(data.opening_hours); else setScheduleConfig(null) }) } }, [target])
    useEffect(() => { if (searchQuery.trim().length < 2) { setResults([]); setShowDropdown(false); return }; const timer = setTimeout(async () => { setSearching(true); const query = searchQuery.trim(); const { data: stores } = await supabase.from('stores').select('id, name, storeSlug, owner_id, logo_url').or(`storeSlug.ilike.%${query}%,name.ilike.%${query}%`).neq('name', 'Meus compromissos').limit(5); const merged: SearchTarget[] = (stores || []).map(s => ({ id: s.id, name: s.name || `@${s.storeSlug}`, slug: s.storeSlug, logo_url: s.logo_url, owner_id: s.owner_id })); setResults(merged); setShowDropdown(true); setBrokenImgIds(new Set()); setSearching(false) }, 300); return () => clearTimeout(timer) }, [searchQuery])
    useEffect(() => { if (target) { loadStoreProducts(target.id); setTargetImgError(false) } }, [target])

    async function loadStoreProducts(storeId: string) {
        setLoadingProducts(true)
        const { data } = await supabase.from('products').select('id, name, description, price, duration_minutes').eq('store_id', storeId).eq('type', 'service').limit(20)
        setStoreProducts(data || [])
        setLoadingProducts(false)
    }

    const slotsLivres = useMemo(() => {
        if (!selectedDate || !target) return []
        const dateStr = selectedDate.toISOString().split('T')[0]
        const config = scheduleConfig || { is_active: true, slot_interval: 60, weekly: { "1": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" }, "2": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" }, "3": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" }, "4": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" }, "5": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" }, "6": { isOpen: false, start: "09:00", end: "13:00", lunchStart: "", lunchEnd: "" }, "0": { isOpen: false, start: "09:00", end: "13:00", lunchStart: "", lunchEnd: "" } }, blocked_dates: [] }
        if (!config.is_active || (config.blocked_dates && config.blocked_dates.includes(dateStr))) return []
        const dayOfWeek = selectedDate.getDay().toString(); const dayConfig = config.weekly?.[dayOfWeek]; if (!dayConfig || !dayConfig.isOpen) return []
        const slotInterval = config.slot_interval || 30; const startMinutes = toMinutes(dayConfig.start || "08:00"); const endMinutes = toMinutes(dayConfig.end || "18:00")
        const lunchStart = dayConfig.lunchStart ? toMinutes(dayConfig.lunchStart) : null; const lunchEnd = dayConfig.lunchEnd ? toMinutes(dayConfig.lunchEnd) : null
        let relevantAppointments = appointments.filter(a => a.date === dateStr && a.status !== 'cancelled' && a.store_id === target.id)
        const list: string[] = []; const now = new Date(); const isToday = selectedDate.toDateString() === now.toDateString(); const currentMinutes = now.getHours() * 60 + now.getMinutes()
        for (let m = startMinutes; m + selectedDuration <= endMinutes; m += slotInterval) {
            if (lunchStart !== null && lunchEnd !== null) { const slotEnd = m + selectedDuration; if ((m >= lunchStart && m < lunchEnd) || (slotEnd > lunchStart && slotEnd <= lunchEnd)) continue }
            if (isToday && m <= currentMinutes) continue
            const timeStr = fromMinutes(m)
            const overlaps = relevantAppointments.some(a => { const aStart = toMinutes(a.time); const aDuration = a.duration_minutes || 60; const aEnd = aStart + aDuration; const slotStart = m; const slotEnd = m + selectedDuration; return slotStart < aEnd && aStart < slotEnd })
            if (!overlaps) list.push(timeStr)
        }
        return list
    }, [selectedDate, appointments, target, scheduleConfig, selectedDuration])

    const eventsByDate = useMemo(() => { const map: Record<string, number> = {}; if (target) { appointments.filter(a => a.store_id === target.id).forEach(a => { map[a.date] = (map[a.date] || 0) + 1 }) }; return map }, [appointments, target])
    const diasDoMes = new Date(calendarYear, calendarMonth + 1, 0).getDate()
    const primeiroDia = new Date(calendarYear, calendarMonth, 1).getDay()

    const selectTarget = (item: SearchTarget) => { setTarget(item); setSearchQuery(''); setShowDropdown(false); setAppointmentNote(''); setSelectedProduct(null); setStep('datetime') }
    const selectProduct = (product: Product) => { setSelectedProduct(product); setAppointmentNote(product.name); setIsEditingNote(false); setSelectedDuration((product as any).duration_minutes || 60) }

    const goBack = () => {
        if (step === 'confirm') setStep('datetime')
        else if (step === 'datetime') { setTarget(null); setStep('search') }
        else onBack()
    }

    async function handleConfirm() {
        if (!selectedDate || !selectedTime || !target) return
        setSubmitting(true)
        const { data: session } = await supabase.auth.getSession()
        const userId = session.session?.user?.id
        if (!userId) { alert('Você precisa estar logado.'); setSubmitting(false); return }
        const dateStr = selectedDate.toISOString().split('T')[0]
        const note = appointmentNote.trim() || 'Agendamento'
        const { data: store } = await supabase.from('stores').select('owner_id, storeSlug, name, logo_url').eq('id', target.id).single()
        if (!store) { alert('Loja não encontrada.'); setSubmitting(false); return }
        const { data: myProfile } = await supabase.from('profiles').select('profileSlug, avatar_url').eq('id', userId).single()
        const slug = myProfile?.profileSlug || ''
        const myAvatar = myProfile?.avatar_url || ''
        const clientAppointment = { store_id: target.id, store_slug: target.slug, store_name: target.name, store_logo_url: store.logo_url || '', provider_profile_id: store.owner_id, date: dateStr, time: selectedTime, duration_minutes: selectedDuration, service_name: note, service_type: 'service', people_count: 1, customer_id: userId, customer_slug: slug, customer_avatar_url: myAvatar, owner_id: store.owner_id, owner_slug: target.slug, status: 'pending', direction: 'outgoing', is_public: isPublic }
        const { error } = await supabase.from('appointments').insert(clientAppointment)
        if (error) { alert(`Erro: ${error.message}`); setSubmitting(false); return }
        await refetch()
        onBack()
    }

    return (
        <main style={{ minHeight: '100vh', background: '#000', paddingBottom: 40, position: 'relative' }}>
            <AnimatedBackground />
            <div className="relative z-10">
                {/* HEADER */}
                <div style={{ background: 'linear-gradient(135deg, #000, #000)', padding: '28px 24px', color: '#fff', borderBottomLeftRadius: 36, borderBottomRightRadius: 36, boxShadow: '0 10px 40px rgba(255,255,255,0.15)' }}>
                    <button onClick={goBack} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 14, width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(10px)' }}>
                        <ArrowLeft size={22} color="#fff" />
                    </button>
                    <h1 style={{ fontSize: 34, fontWeight: 800, marginTop: 16, letterSpacing: '-0.5px' }}>{step === 'search' ? 'Agendar em loja' : step === 'datetime' ? 'Data e horário' : 'Confirmar'}</h1>
                    <p style={{ opacity: 0.7, marginTop: 6, fontSize: 15, fontWeight: 500 }}>{step === 'search' ? 'Busque a loja' : step === 'datetime' ? target?.name || '' : 'Revise os detalhes'}</p>
                </div>

                <div style={{ padding: '20px 20px 0' }}>
                    {/* ETAPA BUSCA */}
                    {step === 'search' && (
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 28, padding: 24, border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                                <div style={{ position: 'relative' }}>
                                    <input ref={searchInputRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Nome da loja ou @..." style={{ width: '100%', padding: '16px 20px', borderRadius: 18, border: '1px solid rgba(255,255,255,0.2)', fontSize: 16, outline: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff' }} autoFocus />
                                    {searching && <Search size={18} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />}
                                    {showDropdown && results.length > 0 && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1e1e2e', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.5)', marginTop: 8, zIndex: 10, maxHeight: 260, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            {results.map((item) => { const logoUrl = getPublicLogoUrl(item.logo_url); const isBroken = brokenImgIds.has(item.id); return (<button key={item.id} onClick={() => selectTarget(item)} style={{ width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: '#fff' }}>{logoUrl && !isBroken ? (<img src={logoUrl} alt={item.name} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.2)' }} onError={() => setBrokenImgIds(prev => new Set(prev).add(item.id))} />) : (<div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg, #f97316, #fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800 }}><Store size={20} /></div>)}<div><p style={{ fontWeight: 700, color: '#fff', margin: 0 }}>{item.name}</p><p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>@{item.slug}</p></div></button>) })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ETAPA DATA/HORA */}
                    {step === 'datetime' && target && (
                        <>
                            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 28, padding: 24, border: '1px solid rgba(255,255,255,0.1)', marginBottom: 24, backdropFilter: 'blur(10px)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                                    {targetImgError || !getPublicLogoUrl(target.logo_url) ? (<div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg, #f97316, #fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Store size={24} /></div>) : (<img src={getPublicLogoUrl(target.logo_url)!} alt={target.name} style={{ width: 52, height: 52, borderRadius: 16, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.2)' }} onError={() => setTargetImgError(true)} />)}
                                    <div style={{ flex: 1 }}><p style={{ fontWeight: 800, fontSize: 18, color: '#fff' }}>{target.name}</p><p style={{ color: '#94a3b8', fontSize: 14 }}>Agendamento na loja</p></div>
                                    <button onClick={() => { setTarget(null); setStep('search') }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input type="text" value={appointmentNote} onChange={(e) => { setAppointmentNote(e.target.value); if (selectedProduct && e.target.value !== selectedProduct.name) setSelectedProduct(null) }} placeholder="Descrição do serviço (opcional)" style={{ width: '100%', padding: '14px 18px', paddingRight: selectedProduct ? 40 : 18, borderRadius: 16, border: '1px solid rgba(255,255,255,0.2)', fontSize: 15, outline: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff' }} />
                                    {selectedProduct && (<button onClick={() => setIsEditingNote(!isEditingNote)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#7c3aed' }}><Edit3 size={16} /></button>)}
                                </div>
                                {!selectedProduct && (<div style={{ marginTop: 16 }}><label style={{ fontWeight: 700, fontSize: 14, color: '#94a3b8', display: 'block', marginBottom: 8 }}>Duração</label><select value={selectedDuration} onChange={(e) => setSelectedDuration(Number(e.target.value))} style={{ width: '100%', padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.2)', fontSize: 15, outline: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff' }}><option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>1h</option><option value={90}>1h30</option><option value={120}>2h</option><option value={180}>3h</option><option value={240}>4h</option></select></div>)}
                                {selectedProduct && (<div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#a78bfa', fontWeight: 700 }}><span>⏱️ {selectedDuration} min</span></div>)}
                                <div style={{ marginTop: 16 }}>
                                    <button onClick={() => setShowProducts(!showProducts)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.2)', background: showProducts ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.1)', color: showProducts ? '#c084fc' : '#94a3b8', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}><ShoppingBag size={18} /> {showProducts ? 'Ocultar produtos' : 'Escolher produto/serviço'}</button>
                                    {showProducts && (<div style={{ marginTop: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', maxHeight: 200, overflowY: 'auto' }}>{loadingProducts ? <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Carregando...</div> : storeProducts.length === 0 ? <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Nenhum produto.</div> : storeProducts.map(product => (<button key={product.id} onClick={() => selectProduct(product)} style={{ width: '100%', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.1)', background: selectedProduct?.id === product.id ? 'rgba(124,58,237,0.2)' : 'transparent', cursor: 'pointer', textAlign: 'left', color: '#fff' }}><div><p style={{ fontWeight: 600, margin: 0 }}>{product.name}</p>{product.description && <p style={{ fontSize: 13, color: '#94a3b8', margin: '2px 0 0' }}>{product.description}</p>}</div>{product.price !== undefined && product.price > 0 && (<span style={{ fontWeight: 700, color: '#c084fc', fontSize: 14 }}>R$ {product.price.toFixed(2)}</span>)}</button>))}</div>)}
                                </div>
                            </div>

                            {/* CALENDÁRIO */}
                            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 28, padding: 24, border: '1px solid rgba(255,255,255,0.1)', marginBottom: 24, backdropFilter: 'blur(10px)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                    <button onClick={() => { if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1) } else setCalendarMonth(m => m - 1) }} style={{ border: 'none', background: 'rgba(255,255,255,0.1)', borderRadius: 14, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronLeft size={20} color="#fff" /></button>
                                    <strong style={{ fontSize: 19, color: '#fff', fontWeight: 800 }}>{meses[calendarMonth]} {calendarYear}</strong>
                                    <button onClick={() => { if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1) } else setCalendarMonth(m => m + 1) }} style={{ border: 'none', background: 'rgba(255,255,255,0.1)', borderRadius: 14, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ChevronRight size={20} color="#fff" /></button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 10 }}>{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => <div key={d} style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#94a3b8' }}>{d}</div>)}</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
                                    {Array.from({ length: primeiroDia }).map((_, i) => (<div key={i} />))}
                                    {Array.from({ length: diasDoMes }).map((_, i) => { const dia = i + 1; const date = new Date(calendarYear, calendarMonth, dia); const dateStr = date.toISOString().split('T')[0]; const count = eventsByDate[dateStr] || 0; const isPast = dateStr < todayStr; const isSelected = selectedDate?.toDateString() === date.toDateString(); return (<button key={dia} disabled={isPast} onClick={() => { setSelectedDate(date); setSelectedTime(null) }} style={{ height: 42, border: isSelected ? '2px solid #7c3aed' : 'none', borderRadius: 14, background: isSelected ? '#7c3aed' : isPast ? 'transparent' : 'rgba(255,255,255,0.1)', color: isSelected ? '#fff' : isPast ? '#475569' : '#fff', cursor: isPast ? 'default' : 'pointer', position: 'relative', fontWeight: 600, fontSize: 15 }}>{dia}{count > 0 && <div style={{ position: 'absolute', top: -5, right: -5, background: '#a855f7', color: '#fff', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{count}</div>}</button>) })}
                                </div>
                            </div>

                            {selectedDate && (
                                <div>
                                    <h3 style={{ fontWeight: 800, fontSize: 20, marginBottom: 16, color: '#fff' }}>Horários disponíveis</h3>
                                    {slotsLivres.length === 0 ? (<div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 28, textAlign: 'center', color: '#94a3b8', border: '1px dashed rgba(255,255,255,0.2)' }}>Nenhum horário livre.</div>) : (<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 10 }}>{slotsLivres.map((time) => (<button key={time} onClick={() => { setSelectedTime(time); setStep('confirm') }} style={{ padding: '16px 12px', borderRadius: 18, border: selectedTime === time ? '2px solid #7c3aed' : '1px solid rgba(255,255,255,0.2)', background: selectedTime === time ? '#7c3aed' : 'rgba(255,255,255,0.1)', fontWeight: 700, cursor: 'pointer', color: '#fff', fontSize: 15 }}>{time}</button>))}</div>)}
                                </div>
                            )}
                        </>
                    )}

                    {/* CONFIRMAÇÃO */}
                    {step === 'confirm' && selectedDate && selectedTime && target && (
                        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 28, padding: 28, border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                            {targetImgError || !getPublicLogoUrl(target.logo_url) ? (<div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, #f97316, #fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 10px 30px rgba(249,115,22,0.25)' }}><Store size={34} color="#fff" /></div>) : (<img src={getPublicLogoUrl(target.logo_url)!} alt={target.name} style={{ width: 72, height: 72, borderRadius: 20, objectFit: 'cover', margin: '0 auto 24px', display: 'block', boxShadow: '0 10px 30px rgba(124,58,237,0.25)' }} onError={() => setTargetImgError(true)} />)}
                            <h2 style={{ textAlign: 'center', fontWeight: 800, fontSize: 24, color: '#fff', marginBottom: 12 }}>{appointmentNote || 'Agendamento'}</h2>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 24 }}><span style={{ fontWeight: 600, color: '#94a3b8' }}>Em</span><div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(249,115,22,0.2)', borderRadius: 20, padding: '8px 16px' }}>{targetImgError || !getPublicLogoUrl(target.logo_url) ? (<div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #f97316, #fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700 }}><Store size={16} /></div>) : (<img src={getPublicLogoUrl(target.logo_url)!} alt={target.name} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />)}<span style={{ fontWeight: 700, color: '#fff' }}>{target.name}</span></div></div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.1)', borderRadius: 18, padding: 18, border: '1px solid rgba(255,255,255,0.1)' }}><Calendar size={22} color="#a78bfa" /><div><p style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>Data</p><p style={{ color: '#94a3b8', fontSize: 14 }}>{selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.1)', borderRadius: 18, padding: 18, border: '1px solid rgba(255,255,255,0.1)' }}><Clock size={22} color="#a78bfa" /><div><p style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>Horário</p><p style={{ color: '#94a3b8', fontSize: 14 }}>{selectedTime}</p></div></div>

                                {/* Toggle público/privado */}
                                <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 18, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontWeight: 600, color: '#fff', fontSize: 15 }}>
                                            {isPublic ? 'Compromisso público' : 'Compromisso privado'}
                                        </span>
                                        <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 16, padding: 3 }}>
                                            <button onClick={() => setIsPublic(false)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 14, border: 'none', background: !isPublic ? 'linear-gradient(135deg, #7c3aed, #a855f7)' : 'transparent', color: !isPublic ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s' }}><Lock size={14} /><span>Privado</span></button>
                                            <button onClick={() => setIsPublic(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 14, border: 'none', background: isPublic ? 'linear-gradient(135deg, #7c3aed, #a855f7)' : 'transparent', color: isPublic ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s' }}><Earth size={14} /><span>Público</span></button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <button onClick={handleConfirm} disabled={submitting} style={{ width: '100%', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff', border: 'none', borderRadius: 20, padding: '18px 20px', fontWeight: 800, fontSize: 17, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: submitting ? 0.7 : 1, boxShadow: '0 12px 35px rgba(124,58,237,0.4)' }}><Check size={22} />{submitting ? 'Salvando...' : 'Confirmar'}</button>
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}