// components/InviteButton.tsx
'use client'

import { useEffect, useState } from 'react'
import { useProfile } from '@/app/contexts/ProfileContext'
import { supabase } from '@/lib/supabase/client'
import { handleShareLink } from '@/lib/share'
import { UserPlus } from 'lucide-react'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface InviteButtonProps {
    className?: string
    label?: string
    // Mostra quantas pessoas a própria pessoa já convidou pro iUser.
    showCount?: boolean
}

// Botão "Convidar para o iUser": compartilha (ou copia) o link de convite da
// própria pessoa — quem entrar por ele fica ligado a ela como indicação.
export default function InviteButton({ className = '', label = 'Convidar para o iUser', showCount = false }: InviteButtonProps) {
    const { profileSlug, userId } = useProfile()
    const [invitedCount, setInvitedCount] = useState<number | null>(null)

    useEffect(() => {
        if (!showCount || !userId) return
        supabase.rpc('get_referral_commission_summary').then(({ data }) => {
            setInvitedCount(Array.isArray(data) ? data.length : 0)
        })
    }, [showCount, userId])

    if (!profileSlug) return null

    const invite = () => {
        const link = `${window.location.origin}/convite?ref=${profileSlug}`
        handleShareLink({
            title: 'Convite para o iUser',
            text: `@${profileSlug} te chama pro iUser — compre, venda, preste serviço ou dirija, tudo numa plataforma só, sem taxa escondida.\n\nEntre pelo meu link e comece agora:`,
            url: link,
        })
    }

    return (
        <button
            onClick={invite}
            className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-full text-sm font-black text-white transition-transform active:scale-95 hover:scale-[1.02] ${className}`}
            style={{ background: GRADIENT, boxShadow: '0 4px 14px #f9731660' }}
        >
            <UserPlus size={18} />
            <span className="flex flex-col items-center leading-tight">
                {label}
                {showCount && invitedCount !== null && (
                    <span className="text-[10px] font-bold opacity-90">
                        {invitedCount === 0 ? 'Você ainda não convidou ninguém' : `Você já convidou ${invitedCount} ${invitedCount === 1 ? 'pessoa' : 'pessoas'}`}
                    </span>
                )}
            </span>
        </button>
    )
}
