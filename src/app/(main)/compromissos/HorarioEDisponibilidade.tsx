// app/(main)/compromissos/HorarioEDisponibilidade.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

interface HorarioEDisponibilidadeProps {
    isOpen: boolean
    onClose: () => void
    userId: string
    activeTab: string // 'pessoal' ou id da loja
    onSaved: () => void
}

const DEFAULT_SCHEDULE = {
    is_active: true,
    slot_interval: 60,
    weekly: {
        "1": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
        "2": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
        "3": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
        "4": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
        "5": { isOpen: true, start: "08:00", end: "18:00", lunchStart: "12:00", lunchEnd: "13:00" },
        "6": { isOpen: false, start: "09:00", end: "13:00", lunchStart: "", lunchEnd: "" },
        "0": { isOpen: false, start: "09:00", end: "13:00", lunchStart: "", lunchEnd: "" }
    },
    blocked_dates: [] as string[]
}

export default function HorarioEDisponibilidade({
    isOpen,
    onClose,
    userId,
    activeTab,
    onSaved,
}: HorarioEDisponibilidadeProps) {
    const [availability, setAvailability] = useState(true)
    const [slotInterval, setSlotInterval] = useState(60)
    const [weekly, setWeekly] = useState<any>(DEFAULT_SCHEDULE.weekly)
    const [blockedDates, setBlockedDates] = useState<string[]>([])
    const [blockedDateInput, setBlockedDateInput] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!isOpen || !userId) return
        setSaving(false)
        const loadConfig = async () => {
            try {
                if (activeTab === 'pessoal') {
                    const { data } = await supabase
                        .from('profiles')
                        .select('working_hours')
                        .eq('id', userId)
                        .single()
                    if (data?.working_hours) {
                        const wh = data.working_hours as any
                        setAvailability(wh.is_active ?? true)
                        setSlotInterval(wh.slot_interval ?? 60)
                        setWeekly(wh.weekly ?? DEFAULT_SCHEDULE.weekly)
                        setBlockedDates(wh.blocked_dates ?? [])
                    } else {
                        setAvailability(true)
                        setSlotInterval(60)
                        setWeekly(DEFAULT_SCHEDULE.weekly)
                        setBlockedDates([])
                    }
                } else {
                    const { data } = await supabase
                        .from('stores')
                        .select('opening_hours')
                        .eq('id', activeTab)
                        .single()
                    if (data?.opening_hours) {
                        const oh = data.opening_hours as any
                        setAvailability(oh.is_active ?? true)
                        setSlotInterval(oh.slot_interval ?? 60)
                        setWeekly(oh.weekly ?? DEFAULT_SCHEDULE.weekly)
                        setBlockedDates(oh.blocked_dates ?? [])
                    } else {
                        setAvailability(true)
                        setSlotInterval(60)
                        setWeekly(DEFAULT_SCHEDULE.weekly)
                        setBlockedDates([])
                    }
                }
            } catch (err) {
                console.error('Erro ao carregar horários:', err)
            }
        }
        loadConfig()
    }, [isOpen, userId, activeTab])

    const updateDaySetting = (dayId: string, field: string, value: any) => {
        setWeekly((prev: any) => ({
            ...prev,
            [dayId]: {
                ...prev[dayId],
                [field]: value
            }
        }))
    }

    const addBlockedDate = () => {
        if (!blockedDateInput) return
        if (blockedDates.includes(blockedDateInput)) return
        setBlockedDates(prev => [...prev, blockedDateInput].sort())
        setBlockedDateInput('')
    }

    const removeBlockedDate = (dateStr: string) => {
        setBlockedDates(prev => prev.filter(d => d !== dateStr))
    }

    const saveSettings = async () => {
        if (!userId) return
        setSaving(true)
        const config = {
            is_active: availability,
            slot_interval: Number(slotInterval),
            weekly,
            blocked_dates: blockedDates,
        }
        try {
            if (activeTab === 'pessoal') {
                const { error } = await supabase
                    .from('profiles')
                    .update({ working_hours: config })
                    .eq('id', userId)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('stores')
                    .update({ opening_hours: config })
                    .eq('id', activeTab)
                if (error) throw error
            }
            alert('Horários e disponibilidade salvos com sucesso!')
            onClose()
            onSaved()
        } catch (err: any) {
            alert('Erro ao salvar configurações: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    if (!isOpen) return null

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <div style={{ width: '100%', maxWidth: 550, background: '#fff', borderRadius: 28, padding: 24, maxHeight: '85vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: 0 }}>Horários e Disponibilidade</h2>
                    <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>

                {/* Disponibilidade geral */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: '#f8fafc', borderRadius: 20, border: '1px solid #e2e8f0', marginBottom: 20 }}>
                    <div>
                        <h4 style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>Permitir Agendamentos</h4>
                        <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>Ativar ou desativar esta agenda para reservas</p>
                    </div>
                    <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26 }}>
                        <input type="checkbox" checked={availability} onChange={(e) => setAvailability(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                        <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: availability ? '#7c3aed' : '#cbd5e1', borderRadius: 26, transition: '0.3s' }}>
                            <span style={{ position: 'absolute', height: 20, width: 20, left: availability ? 24 : 3, bottom: 3, backgroundColor: 'white', transition: '0.3s', borderRadius: '50%' }} />
                        </span>
                    </label>
                </div>

                {availability && (
                    <>
                        {/* Intervalo de slots */}
                        <div style={{ marginBottom: 24 }}>
                            <label style={{ fontWeight: 700, fontSize: 14, color: '#475569', display: 'block', marginBottom: 8 }}>Intervalo base entre horários</label>
                            <select
                                value={slotInterval}
                                onChange={(e) => setSlotInterval(Number(e.target.value))}
                                style={{ width: '100%', padding: '12px 16px', borderRadius: 14, border: '2px solid #e2e8f0', fontSize: 15, outline: 'none', background: '#fff' }}
                            >
                                <option value={15}>15 minutos</option>
                                <option value={30}>30 minutos</option>
                                <option value={45}>45 minutos</option>
                                <option value={60}>60 minutos (1 hora)</option>
                            </select>
                        </div>

                        {/* Horários por dia da semana */}
                        <div style={{ marginBottom: 24 }}>
                            <label style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', display: 'block', marginBottom: 12 }}>Dias de Funcionamento</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {[
                                    { id: '1', name: 'Segunda-feira' },
                                    { id: '2', name: 'Terça-feira' },
                                    { id: '3', name: 'Quarta-feira' },
                                    { id: '4', name: 'Quinta-feira' },
                                    { id: '5', name: 'Sexta-feira' },
                                    { id: '6', name: 'Sábado' },
                                    { id: '0', name: 'Domingo' }
                                ].map((day) => {
                                    const dayConfig = weekly[day.id] || { isOpen: false, start: '08:00', end: '18:00', lunchStart: '', lunchEnd: '' }
                                    const hasLunch = !!(dayConfig.lunchStart && dayConfig.lunchEnd)
                                    return (
                                        <div key={day.id} style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 18, background: dayConfig.isOpen ? '#fff' : '#f8fafc' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: dayConfig.isOpen ? 10 : 0 }}>
                                                <span style={{ fontWeight: 700, fontSize: 14, color: dayConfig.isOpen ? '#1e293b' : '#94a3b8' }}>{day.name}</span>
                                                <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22 }}>
                                                    <input type="checkbox" checked={dayConfig.isOpen} onChange={(e) => updateDaySetting(day.id, 'isOpen', e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                                                    <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: dayConfig.isOpen ? '#7c3aed' : '#e2e8f0', borderRadius: 22, transition: '0.3s' }}>
                                                        <span style={{ position: 'absolute', height: 16, width: 16, left: dayConfig.isOpen ? 21 : 3, bottom: 3, backgroundColor: 'white', transition: '0.3s', borderRadius: '50%' }} />
                                                    </span>
                                                </label>
                                            </div>

                                            {dayConfig.isOpen && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                    {/* Horário de expediente */}
                                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Entrada</span>
                                                            <input type="time" value={dayConfig.start} onChange={(e) => updateDaySetting(day.id, 'start', e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />
                                                        </div>
                                                        <div style={{ flex: 1 }}>
                                                            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Saída</span>
                                                            <input type="time" value={dayConfig.end} onChange={(e) => updateDaySetting(day.id, 'end', e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />
                                                        </div>
                                                    </div>

                                                    {/* Toggle Almoço */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                                        <input
                                                            type="checkbox"
                                                            id={`lunch-${day.id}`}
                                                            checked={hasLunch}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    updateDaySetting(day.id, 'lunchStart', '12:00')
                                                                    updateDaySetting(day.id, 'lunchEnd', '13:00')
                                                                } else {
                                                                    updateDaySetting(day.id, 'lunchStart', '')
                                                                    updateDaySetting(day.id, 'lunchEnd', '')
                                                                }
                                                            }}
                                                        />
                                                        <label htmlFor={`lunch-${day.id}`} style={{ fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer' }}>Intervalo de Almoço</label>
                                                    </div>

                                                    {hasLunch && (
                                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                            <div style={{ flex: 1 }}>
                                                                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Início Almoço</span>
                                                                <input type="time" value={dayConfig.lunchStart} onChange={(e) => updateDaySetting(day.id, 'lunchStart', e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />
                                                            </div>
                                                            <div style={{ flex: 1 }}>
                                                                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Fim Almoço</span>
                                                                <input type="time" value={dayConfig.lunchEnd} onChange={(e) => updateDaySetting(day.id, 'lunchEnd', e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13 }} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Bloqueio de datas específicas */}
                        <div style={{ marginBottom: 24 }}>
                            <label style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', display: 'block', marginBottom: 8 }}>Datas Fechadas / Bloqueadas</label>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <input type="date" value={blockedDateInput} onChange={(e) => setBlockedDateInput(e.target.value)} style={{ flex: 1, padding: '10px 14px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14 }} />
                                <button onClick={addBlockedDate} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 12, padding: '0 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Bloquear</button>
                            </div>
                            {blockedDates.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto', padding: 8, background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0' }}>
                                    {blockedDates.map((d) => {
                                        const [year, month, day] = d.split('-')
                                        const formatted = `${day}/${month}/${year}`
                                        return (
                                            <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#fee2e2', color: '#ef4444', borderRadius: 10, fontSize: 12, fontWeight: 700 }}>
                                                {formatted}
                                                <button onClick={() => removeBlockedDate(d)} style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: 0, fontSize: 12, fontWeight: 800 }}>✕</button>
                                            </span>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                    <button onClick={onClose} style={{ flex: 1, padding: '14px', borderRadius: 16, border: '2px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, cursor: 'pointer', fontSize: 15 }}>Cancelar</button>
                    <button onClick={saveSettings} disabled={saving} style={{ flex: 1, padding: '14px', borderRadius: 16, border: 'none', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 15, opacity: saving ? 0.7 : 1 }}>{saving ? 'Salvando...' : 'Salvar'}</button>
                </div>
            </div>
        </div>
    )
}