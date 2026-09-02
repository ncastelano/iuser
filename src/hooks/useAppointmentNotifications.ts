// src/hooks/useAppointmentNotifications.ts
'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface Notification {
    id: string
    user_id: string
    type: 'appointment_invite' | 'appointment_confirmed' | 'appointment_cancelled'
    title: string
    message: string
    appointment_id: string
    read: boolean
    created_at: string
    data?: any
}

export function useAppointmentNotifications(userId: string | null) {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [permission, setPermission] = useState<NotificationPermission>('default')

    const requestPermission = useCallback(async () => {
        if (!('Notification' in window)) return
        const result = await Notification.requestPermission()
        setPermission(result)
        return result
    }, [])

    const fetchNotifications = useCallback(async () => {
        if (!userId) return

        const { data, error } = await supabase
            .from('appointment_notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50)

        if (error) {
            console.error('Erro ao buscar notificações:', error)
            return
        }

        setNotifications(data || [])
        setUnreadCount(data?.filter(n => !n.read).length || 0)
    }, [userId])

    const markAsRead = useCallback(async (notificationId: string) => {
        const { error } = await supabase
            .from('appointment_notifications')
            .update({ read: true })
            .eq('id', notificationId)

        if (!error) {
            setNotifications(prev =>
                prev.map(n =>
                    n.id === notificationId ? { ...n, read: true } : n
                )
            )
            setUnreadCount(prev => Math.max(0, prev - 1))
        }
    }, [])

    const markAllAsRead = useCallback(async () => {
        if (!userId) return

        const { error } = await supabase
            .from('appointment_notifications')
            .update({ read: true })
            .eq('user_id', userId)
            .eq('read', false)

        if (!error) {
            setNotifications(prev =>
                prev.map(n => ({ ...n, read: true }))
            )
            setUnreadCount(0)
        }
    }, [userId])

    useEffect(() => {
        if (!userId) return

        fetchNotifications()

        const channel = supabase
            .channel(`notifications-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'appointment_notifications',
                    filter: `user_id=eq.${userId}`,
                },
                (payload) => {
                    const newNotification = payload.new as Notification
                    setNotifications(prev => [newNotification, ...prev])
                    setUnreadCount(prev => prev + 1)

                    // Mostrar toast
                    toast.info(newNotification.message, {
                        duration: 8000,
                        action: {
                            label: 'Ver',
                            onClick: () => {
                                window.location.href = '/compromissos'
                            },
                        },
                    })
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [userId, fetchNotifications])

    useEffect(() => {
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setPermission(Notification.permission)
        }
    }, [])

    return {
        notifications,
        unreadCount,
        permission,
        requestPermission,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
    }
}