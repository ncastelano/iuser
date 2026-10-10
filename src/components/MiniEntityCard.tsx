// Cartão pequeno de perfil ou loja pra listas curtas (busca e "últimos acessados" da home): só a foto (com a borda da
// pessoa, quando tem), o nome e o @ do perfil/loja. Passar o mouse num perfil conta como visita (quem usa liga o onHover).
'use client'

import { Store as StoreIcon } from 'lucide-react'
import PlanAvatarRing from '@/components/PlanAvatarRing'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface MiniEntityCardProps {
    kind: 'profile' | 'store'
    name: string
    slug?: string | null
    imageUrl?: string | null
    /** id do perfil — pra mostrar a borda do avatar */
    profileId?: string | null
    colors: any
    onClick: () => void
    onHover?: () => void
}

export default function MiniEntityCard({ kind, name, slug, imageUrl, profileId, colors, onClick, onHover }: MiniEntityCardProps) {
    const isStore = kind === 'store'
    const photo = (
        <div
            className={`w-12 h-12 overflow-hidden flex items-center justify-center flex-shrink-0 text-white font-black ${isStore ? 'rounded-xl' : 'rounded-full'}`}
            style={{ background: GRADIENT }}
        >
            {imageUrl ? (
                <img src={imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : isStore ? (
                <StoreIcon size={20} />
            ) : (
                <span className="text-lg">{(name || '?').charAt(0).toUpperCase()}</span>
            )}
        </div>
    )

    return (
        <div
            onClick={onClick}
            onMouseEnter={onHover}
            className="flex items-center gap-3 px-3 py-2.5 rounded-2xl border cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 min-w-0"
            style={{ background: colors.surface, borderColor: colors.border, boxShadow: colors.shadow }}
        >
            {isStore || !profileId ? photo : <PlanAvatarRing userId={profileId} width={3}>{photo}</PlanAvatarRing>}
            <div className="min-w-0 flex-1">
                {/* Perfil: só o @ (o nome pode ser enorme). Loja: nome e @ da loja */}
                <p className="text-sm font-black leading-tight truncate" style={{ color: colors.textPrimary }}>
                    {isStore ? (name || 'Loja') : (slug ? `@${slug}` : name || 'Usuário')}
                </p>
                {isStore && slug && <p className="text-xs font-bold truncate" style={{ color: colors.accent }}>@{slug}</p>}
            </div>
        </div>
    )
}
