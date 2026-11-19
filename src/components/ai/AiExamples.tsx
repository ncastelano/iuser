// src/components/ai/AiExamples.tsx — ao tocar no "O que você procura?" vazio: exemplos de PEDIDOS à IA do iUser, conforme quem a pessoa é
// (dona de loja, motorista, cliente). Tocar num exemplo manda o pedido à IA (que ainda pede Confirmar no que muda algo).
'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { examplesFor } from '@/modules/ai-assistant/domain'

export default function AiExamples({ userId, onPick }: { userId: string | null; onPick: (text: string) => void }) {
    const { colors } = useTheme()
    const [role, setRole] = useState<{ store: string | null; driver: boolean }>({ store: null, driver: false })
    useEffect(() => {
        if (!userId) { setRole({ store: null, driver: false }); return }
        let alive = true
        Promise.all([
            supabase.from('my_stores').select('name').limit(1),
            supabase.from('driver_vehicles').select('vehicle_kind').eq('driver_id', userId).limit(1),
        ]).then(([s, v]) => { if (alive) setRole({ store: (s.data as any)?.[0]?.name || null, driver: ((v.data as any[]) || []).length > 0 }) })
            .catch(() => {})
        return () => { alive = false }
    }, [userId])

    const list = examplesFor(!!role.store, role.driver)
    return (
        <section className="mb-6">
            <p className="text-[12px] font-black uppercase tracking-wide flex items-center gap-1.5 mb-2" style={{ color: '#f97316' }}><Sparkles size={14} /> Peça à IA do iUser</p>
            <p className="text-[12.5px] mb-2.5" style={{ color: colors.textSecondary }}>Escreva ou fale o que quer fazer. Ela entende e, antes de mudar qualquer coisa, pede a sua confirmação.</p>
            <div className="flex flex-wrap gap-2">
                {list.map((t) => (
                    <button key={t} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(t)} className="h-9 px-3.5 rounded-full text-[12.5px] font-bold"
                        style={{ background: colors.surface, border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                        “{t}”
                    </button>
                ))}
            </div>
        </section>
    )
}
