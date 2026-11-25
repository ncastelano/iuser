// src/components/AvatarCrown.tsx — a coroa sobre o avatar (ouro, prata ou bronze), proporcional ao avatar. Ver lib/outdoorCrowns.ts.
'use client'

import { Crown } from 'lucide-react'
import { CROWN_COLOR } from '@/lib/outdoorCrowns'
import type { Medal } from '@/modules/outdoor'

export default function AvatarCrown({ medal }: { medal: Medal }) {
    const c = CROWN_COLOR[medal]
    return (
        <span aria-label={`${medal === 'gold' ? '1º' : medal === 'silver' ? '2º' : '3º'} lugar no Outdoor iUser`} className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-20 flex items-center justify-center" style={{ top: '-34%', width: '46%', height: '40%' }}>
            <Crown className="w-full h-full drop-shadow" style={{ color: c }} fill={c} strokeWidth={1.6} />
        </span>
    )
}
