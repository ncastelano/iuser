// src/components/NotificationBell.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, Check, X, Calendar, CheckCheck, Volume2, VolumeX } from 'lucide-react'
import { useAppointmentNotifications } from '@/hooks/useAppointmentNotifications'
import { useTheme } from '@/app/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { supabase } from '@/lib/supabase/client'
import { PostgrestError } from '@supabase/supabase-js'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface Notification {
    id: string
    type: 'appointment_invite' | 'appointment_confirmed' | 'appointment_cancelled'
    title: string
    message: string
    appointment_id: string
    read: boolean
    created_at: string
    data?: any
}

interface ProfileData {
    id: string
}

export function NotificationBell() {
    const { profileSlug, loading } = useProfile()
    const [userId, setUserId] = useState<string | null>(null)
    const [isOpen, setIsOpen] = useState(false)
    const [soundEnabled, setSoundEnabled] = useState(true)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const { colors } = useTheme()

    // Obter userId do perfil
    useEffect(() => {
        if (!profileSlug) return

        const fetchUserId = async () => {
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('profileSlug', profileSlug)
                    .single()

                if (error) {
                    console.error('Erro ao buscar userId:', error.message)
                    return
                }

                if (data) {
                    setUserId((data as ProfileData).id)
                }
            } catch (err) {
                const error = err as Error
                console.error('Erro ao buscar userId:', error.message)
            }
        }

        fetchUserId()
    }, [profileSlug])

    const {
        notifications,
        unreadCount,
        permission,
        requestPermission,
        markAsRead,
        markAllAsRead,
    } = useAppointmentNotifications(userId)

    // Fechar dropdown ao clicar fora
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Solicitar permissão automaticamente
    useEffect(() => {
        if (userId && permission === 'default') {
            requestPermission()
        }
    }, [userId, permission, requestPermission])

    const formatDate = (date: string) => {
        const d = new Date(date)
        const now = new Date()
        const diff = now.getTime() - d.getTime()

        if (diff < 60000) return 'Agora'
        if (diff < 3600000) return `${Math.floor(diff / 60000)} min`
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    }

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case 'appointment_invite':
                return <Calendar size={16} style={{ color: '#f97316' }} />
            case 'appointment_confirmed':
                return <Check size={16} style={{ color: '#10b981' }} />
            case 'appointment_cancelled':
                return <X size={16} style={{ color: '#ef4444' }} />
            default:
                return <Bell size={16} style={{ color: colors.textSecondary }} />
        }
    }

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 rounded-full transition-all hover:scale-105"
                style={{
                    background: isOpen ? GRADIENT : 'transparent',
                    color: isOpen ? '#ffffff' : colors.textPrimary,
                }}
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center animate-badge-pop"
                        style={{
                            background: '#ef4444',
                            color: '#ffffff',
                            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                        }}
                    >
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div
                    className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl shadow-2xl overflow-hidden"
                    style={{
                        background: colors.surface,
                        border: `1px solid ${colors.border}`,
                        boxShadow: `0 20px 60px rgba(0,0,0,0.3)`,
                        maxHeight: '480px',
                    }}
                >
                    {/* Header */}
                    <div
                        className="flex items-center justify-between p-4 border-b"
                        style={{ borderColor: colors.border }}
                    >
                        <div className="flex items-center gap-2">
                            <Bell size={18} style={{ color: '#f97316' }} />
                            <h3 className="font-bold text-sm" style={{ color: colors.textPrimary }}>
                                Notificações
                            </h3>
                            {unreadCount > 0 && (
                                <span
                                    className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                    style={{ background: '#f9731620', color: '#f97316' }}
                                >
                                    {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Botão de som */}
                            <button
                                onClick={() => setSoundEnabled(!soundEnabled)}
                                className="p-1 rounded hover:bg-white/10 transition"
                                style={{ color: colors.textSecondary }}
                            >
                                {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                            </button>

                            {/* Marcar todas como lidas */}
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllAsRead}
                                    className="p-1 rounded hover:bg-white/10 transition"
                                    style={{ color: colors.textSecondary }}
                                    title="Marcar todas como lidas"
                                >
                                    <CheckCheck size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Lista de notificações */}
                    <div className="overflow-y-auto max-h-[360px]">
                        {notifications.length === 0 ? (
                            <div className="p-8 text-center">
                                <Bell size={32} style={{ color: colors.textSecondary, margin: '0 auto 8px' }} />
                                <p className="text-sm" style={{ color: colors.textSecondary }}>
                                    Nenhuma notificação
                                </p>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                    Você será notificado quando receber convites
                                </p>
                            </div>
                        ) : (
                            notifications.map((notification: Notification) => (
                                <button
                                    key={notification.id}
                                    onClick={() => {
                                        markAsRead(notification.id)
                                        window.location.href = '/compromissos'
                                    }}
                                    className="w-full flex items-start gap-3 p-3 transition-colors hover:bg-white/5 text-left"
                                    style={{
                                        background: notification.read ? 'transparent' : 'rgba(249, 115, 22, 0.05)',
                                        borderBottom: `1px solid ${colors.border}`,
                                    }}
                                >
                                    <div
                                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                        style={{
                                            background: notification.read ? 'rgba(255,255,255,0.05)' : '#f9731620',
                                        }}
                                    >
                                        {getNotificationIcon(notification.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <p
                                                className="text-xs font-bold truncate"
                                                style={{
                                                    color: notification.read ? colors.textSecondary : colors.textPrimary,
                                                }}
                                            >
                                                {notification.title}
                                            </p>
                                            <span className="text-[9px] flex-shrink-0" style={{ color: colors.textSecondary }}>
                                                {formatDate(notification.created_at)}
                                            </span>
                                        </div>
                                        <p
                                            className="text-xs mt-0.5 line-clamp-2"
                                            style={{
                                                color: notification.read ? colors.textSecondary : colors.textPrimary,
                                                opacity: notification.read ? 0.6 : 1,
                                            }}
                                        >
                                            {notification.message}
                                        </p>
                                        {!notification.read && (
                                            <span
                                                className="inline-block w-1.5 h-1.5 rounded-full mt-1"
                                                style={{ background: '#f97316' }}
                                            />
                                        )}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    {notifications.length > 0 && (
                        <div
                            className="p-3 border-t text-center"
                            style={{ borderColor: colors.border }}
                        >
                            <button
                                onClick={() => window.location.href = '/compromissos'}
                                className="text-xs font-bold transition hover:opacity-70"
                                style={{ color: '#f97316' }}
                            >
                                Ver todos os compromissos
                            </button>
                        </div>
                    )}
                </div>
            )}

            <style jsx global>{`
                @keyframes badge-pop {
                    0% { transform: scale(0); opacity: 0; }
                    50% { transform: scale(1.5); }
                    100% { transform: scale(1); opacity: 1; }
                }
                .animate-badge-pop {
                    animation: badge-pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
            `}</style>
        </div>
    )
}