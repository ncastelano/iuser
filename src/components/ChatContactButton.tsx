// Botão "Conversar" das páginas de perfil e de loja — aparece só quando a pessoa/loja ligou o chat
// (profiles.chat_enabled / stores.chat_enabled), no mesmo cartão de vidro do WhatsApp e do Instagram.
// Visitante sem conta vai pro login e volta pra mesma página; com conta abre (ou retoma) a conversa.
'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { notifyChatMessage } from '@/lib/notifyRideStatus'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Spinner } from '@/components/Spinner'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface Props {
    /** Conversar com este perfil... */
    profileId?: string
    /** ...ou com esta loja */
    storeId?: string
    colors: any
    background?: string
    /** 'pill': botão redondo cheio (mesmo desenho do botão de WhatsApp da página do serviço) */
    variant?: 'card' | 'pill' | 'v3' | 'v3quiet'
    /** Serviço/postagem de onde a pessoa veio: já manda uma mensagem com ela no chat de quem oferece */
    productId?: string
    /** Candidatura de um pedido de serviço: manda no chat um cartão com o pedido (vale pros dois lados) */
    requestApplicationId?: string
    /** Texto do botão no formato 'pill' */
    label?: string
}

export default function ChatContactButton({ profileId, storeId, colors, background = 'rgba(255, 255, 255, 0.08)', variant = 'card', productId, requestApplicationId, label = 'Conversar pelo iUser' }: Props) {
    const router = useRouter()
    const pathname = usePathname()
    const { userId } = useProfile()
    const [loading, setLoading] = useState(false)

    const open = async () => {
        if (!userId) { router.push(`/login?redirect=${encodeURIComponent(pathname)}`); return }
        setLoading(true)
        const { data, error } = requestApplicationId
            ? await supabase.rpc('start_conversation_about_request', { p_application: requestApplicationId })
            : productId
            ? await supabase.rpc('start_conversation_about_product', { p_product: productId })
            : await supabase.rpc('start_conversation', { p_owner_profile: profileId ?? null, p_store: storeId ?? null })
        setLoading(false)
        if (error || !data) { toast.error(error?.message || 'Não foi possível abrir a conversa'); return }
        // Veio de um serviço: a mensagem com a postagem já foi criada — avisa quem recebe no aparelho
        if (productId || requestApplicationId) notifyChatMessage(data as string)
        router.push(`/conversas?c=${data}`)
    }

    // v3: cápsula compacta na cor do botão Seguir (mesma altura dos botões de ação da página); o texto vem de `label`
    if (variant === 'v3') {
        return (
            <button
                onClick={open}
                disabled={loading}
                className="flex-1 min-w-0 h-11 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-70"
                style={{ background: '#f97316', color: '#fff' }}
            >
                {loading ? <Spinner size={16} color="#fff" /> : <MessageCircle size={16} />}
                {label}
            </button>
        )
    }

    // v3quiet: botão neutro (mesmo formato dos outros contatos da loja), só o ícone leva a cor
    if (variant === 'v3quiet') {
        return (
            <button
                onClick={open}
                disabled={loading}
                className="flex-1 min-w-0 h-10 rounded-full text-[12px] font-black flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-70"
                style={{ background: `${colors.border}40`, color: colors.textPrimary }}
            >
                {loading ? <Spinner size={15} color="#f97316" /> : <MessageCircle size={15} style={{ color: '#f97316' }} />}
                {label}
            </button>
        )
    }

    if (variant === 'pill') {
        return (
            <button
                onClick={open}
                disabled={loading}
                className="w-full py-3.5 rounded-full font-black text-sm flex items-center justify-center gap-2 text-white transition hover:scale-[1.02] active:scale-95 disabled:opacity-70"
                style={{ background: GRADIENT }}
            >
                {loading ? <Spinner size={16} color="#fff" /> : <MessageCircle size={18} />}
                {label}
            </button>
        )
    }

    return (
        <button
            onClick={open}
            disabled={loading}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:scale-[1.01] disabled:opacity-70"
            style={{ background, border: `1px solid ${colors.border}` }}
        >
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: GRADIENT }}>
                {loading ? <Spinner size={16} color="#fff" /> : <MessageCircle size={18} />}
            </div>
            <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Conversar</p>
                <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>Mande uma mensagem pelo iUser</p>
            </div>
        </button>
    )
}
