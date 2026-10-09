// "Ver meu Perfil", "Compartilhar Link" e "Convidar para o iUser" — ficam logo abaixo do plano, em cima de "Conta".
'use client'

import { useRouter } from 'next/navigation'
import { Copy, User } from 'lucide-react'
import { handleShareLink } from '@/lib/share'
import InviteButton from '@/components/InviteButton'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function ProfileLinkButtons({ profileSlug, name }: { profileSlug: string; name?: string | null }) {
    const router = useRouter()
    const base = {
        padding: '0.75rem 1.25rem',
        borderRadius: '9999px',
        fontWeight: 700,
        fontSize: '0.875rem',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        flex: 1,
        border: 'none',
        cursor: 'pointer',
        background: GRADIENT,
        color: '#ffffff',
        boxShadow: '0 4px 12px #f9731640',
    } as const

    return (
        <div className="flex gap-2 flex-wrap">
            <button onClick={() => router.push(`/${profileSlug}`)} style={base} className="hover:scale-105 transition-transform">
                <User size={18} />
                Ver meu Perfil
            </button>
            <button
                onClick={() => handleShareLink({
                    title: name ? `${name} | iUser` : 'iUser',
                    text: `Confira o perfil de ${name || `@${profileSlug}`} no iUser!`,
                    url: `${window.location.origin}/${profileSlug}`,
                })}
                style={base}
                className="hover:scale-105 transition-transform"
            >
                <Copy size={18} />
                Compartilhar Link
            </button>
            <InviteButton className="!w-auto flex-1 min-w-[160px]" />
        </div>
    )
}
