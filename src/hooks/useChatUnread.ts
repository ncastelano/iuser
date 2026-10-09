// Quantas conversas têm mensagem nova pra mim (selo do ícone de chat no cabeçalho).
// O banco conta em todos os papéis (perfil e lojas); aqui só se escuta o Realtime pra recontar quando chega algo.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export function useChatUnread(userId: string | null | undefined) {
    const [count, setCount] = useState(0)

    const refresh = useCallback(async () => {
        if (!userId) { setCount(0); return }
        const { data } = await supabase.rpc('get_my_chat_unread_total')
        setCount(Number(data) || 0)
    }, [userId])

    useEffect(() => {
        refresh()
        if (!userId) return
        // O Realtime só entrega as mensagens das conversas de que eu participo (policies do banco)
        const channel = supabase
            .channel(`chat-unread-${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => refresh())
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, () => refresh())
            .subscribe()
        const onFocus = () => refresh()
        window.addEventListener('focus', onFocus)
        return () => {
            window.removeEventListener('focus', onFocus)
            supabase.removeChannel(channel)
        }
    }, [userId, refresh])

    return count
}
