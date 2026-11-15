// Home da 3.0: de onde o app mede "perto" (o local da pessoa) e o botão para definir/trocar — o que a home 2.0 tinha no "Definir local".
// Logada: grava no perfil (com a pergunta do Radar, como na 2.0); visitante: só neste aparelho. O "Ver ao redor" relê sozinho (LOCATION_CHANGED_EVENT).
'use client'

import { useEffect, useState } from 'react'
import { MapPin, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import LocationPicker from '@/components/LocationPicker'
import { clearMyLocation, loadMyLocation, LOCATION_CHANGED_EVENT, saveMyLocation, shortPlace, type MyLocation } from '@/lib/myLocation'

export default function HomeLocationChip({ userId }: { userId: string | null }) {
    const { colors } = useTheme()
    const [loc, setLoc] = useState<MyLocation | null | undefined>(undefined)
    const [open, setOpen] = useState(false)

    useEffect(() => {
        let alive = true
        const load = () => loadMyLocation(supabase, userId).then((l) => { if (alive) setLoc(l) })
        load()
        window.addEventListener(LOCATION_CHANGED_EVENT, load)
        return () => { alive = false; window.removeEventListener(LOCATION_CHANGED_EVENT, load) }
    }, [userId])

    if (loc === undefined) return <div className="h-9" aria-hidden />

    return (
        <>
            <button type="button" onClick={() => setOpen(true)}
                className="mt-3 w-full flex items-center gap-2 rounded-full px-3 h-9 text-left active:scale-[0.99] transition"
                style={{ background: `${colors.border}40`, color: colors.textPrimary }}
                aria-label={loc ? 'Trocar o local de onde medimos o que está perto' : 'Definir seu local'}>
                <MapPin size={15} className="flex-shrink-0" style={{ color: '#f97316' }} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
                    {loc ? <>Perto de <span style={{ color: colors.textPrimary }}>{shortPlace(loc.address)}</span></> : 'Defina seu local para ver o que está perto'}
                </span>
                <span className="flex-shrink-0 text-[12px] font-black flex items-center" style={{ color: '#f97316' }}>{loc ? 'Mudar' : 'Definir'}<ChevronRight size={14} /></span>
            </button>
            {open && (
                <LocationPicker
                    initialLocation={loc ?? null}
                    allowDriverSync={false}
                    allowGuest
                    askRadarVisibility
                    onClose={() => setOpen(false)}
                    onSave={async (l) => {
                        const err = await saveMyLocation(supabase, userId, l)
                        setOpen(false)
                        if (err) { toast.error('Erro ao salvar: ' + err); return }
                        toast.success(userId ? 'Local salvo.' : 'Local definido neste aparelho — usamos só para mostrar o que está perto de você.')
                    }}
                    onClear={loc ? async () => {
                        const err = await clearMyLocation(supabase, userId)
                        setOpen(false)
                        if (err) { toast.error('Erro ao remover: ' + err); return }
                        toast.success('Localização removida.')
                    } : undefined}
                />
            )}
        </>
    )
}
