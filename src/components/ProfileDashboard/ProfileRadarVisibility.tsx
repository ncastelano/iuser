// "Visível no Radar" em Informações do Perfil: mostra se a pessoa aparece (ou não) no mapa do Radar e deixa ligar/desligar.
// É OPCIONAL e começa DESLIGADO (profiles.show_on_map nasce false): só aparece no Radar quem define a localização e escolhe aparecer —
// na 1ª etapa de "Definir localização" ou aqui. Visível = a pessoa (filtro Pessoas) e os serviços do perfil entram no mapa; a posição
// pública é sempre aproximada. Desligado, a localização fica guardada só como endereço para os pedidos nas lojas.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, MapPin, Radar } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import LocationPicker from '@/components/LocationPicker'
import DashboardSection from './DashboardSection'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface Row {
    address: string | null
    address_number: string | null
    address_complement: string | null
    store_lat: number | null
    store_lng: number | null
    show_location: boolean | null
    show_on_map: boolean | null
}

export default function ProfileRadarVisibility({ profileId }: { profileId: string }) {
    const { colors } = useTheme()
    const router = useRouter()
    const [row, setRow] = useState<Row | null>(null)
    const [busy, setBusy] = useState(false)
    const [showPicker, setShowPicker] = useState(false)

    const load = useCallback(async () => {
        const { data } = await supabase
            .from('my_profile')
            .select('address, address_number, address_complement, store_lat, store_lng, show_location, show_on_map')
            .eq('id', profileId)
            .maybeSingle()
        setRow((data as Row) || null)
    }, [profileId])
    useEffect(() => { load() }, [load])

    const hasLocation = row?.store_lat != null && row?.store_lng != null
    const profileShows = row?.show_location ?? true
    const wantsRadar = row?.show_on_map ?? false
    const visible = hasLocation && profileShows && wantsRadar

    const toggle = async () => {
        if (!row || busy) return
        setBusy(true)
        const { error } = await supabase.from('profiles').update({ show_on_map: !wantsRadar }).eq('id', profileId)
        setBusy(false)
        if (error) { toast.error('Não foi possível salvar: ' + error.message); return }
        setRow({ ...row, show_on_map: !wantsRadar })
        toast.success(!wantsRadar ? 'Você agora está visível no Radar' : 'Você saiu do Radar')
    }

    const saveLocation = async (loc: { lat: number; lng: number; address: string; addressNumber: string; addressComplement: string }) => {
        setShowPicker(false)
        const { error } = await supabase.from('profiles').update({
            address: loc.address,
            address_number: loc.addressNumber || null,
            address_complement: loc.addressComplement || null,
            store_lat: loc.lat,
            store_lng: loc.lng,
        }).eq('id', profileId)
        if (error) { toast.error('Erro ao salvar a localização: ' + error.message); return }
        toast.success('Localização salva')
        load() // o LocationPicker já gravou a escolha (Radar ou só endereço)
    }

    const reason = !hasLocation
        ? 'Defina sua localização para poder aparecer no Radar.'
        : !profileShows
            ? 'O seu perfil está escondendo a localização (chave "Mostrar no meu perfil", em Configurações de localização).'
            : null

    const statusColor = visible ? '#16a34a' : colors.textSecondary
    const addressLine = row?.address ? [row.address.split(',').slice(0, 2).join(','), row.address_number].filter(Boolean).join(', ') : null

    return (
        <>
        <DashboardSection
            storageKey="config-visivel-radar"
            title="Visível no Radar"
            subtitle="Se você aparece no mapa do Radar"
            collapsedSummary={row ? (visible ? 'Visível' : 'Oculto') : ''}
            defaultExpanded
        >
            <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ border: `1px solid ${visible ? '#16a34a66' : colors.border}`, background: visible ? '#16a34a12' : 'transparent' }}>
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: visible ? '#16a34a' : 'rgba(120,120,120,0.55)' }}>
                    {visible ? <Eye size={18} /> : <EyeOff size={18} />}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black" style={{ color: statusColor }}>{visible ? 'Você está visível no Radar' : 'Você não aparece no Radar'}</p>
                    <p className="text-[11px] leading-snug" style={{ color: colors.textSecondary }}>
                        {visible
                            ? 'Você (na aba Pessoas) e os seus serviços aparecem no mapa. A posição mostrada é aproximada.'
                            : reason || 'Sua localização fica guardada só como endereço para os pedidos nas lojas.'}
                    </p>
                </div>
                <button
                    onClick={toggle}
                    disabled={!row || busy || !hasLocation || !profileShows}
                    role="switch"
                    aria-checked={wantsRadar && hasLocation && profileShows}
                    aria-label="Visível no Radar"
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-50 ${wantsRadar && hasLocation && profileShows ? 'bg-orange-500' : 'bg-gray-400'}`}
                >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${wantsRadar && hasLocation && profileShows ? 'right-1' : 'left-1'}`} />
                </button>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ border: `1px solid ${colors.border}` }}>
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: GRADIENT }}><MapPin size={18} /></span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{addressLine || 'Sem localização definida'}</p>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                        {hasLocation ? 'Localização definida' : 'Ao definir, você escolhe se aparece no Radar ou só guarda o endereço'}
                    </p>
                </div>
                <button onClick={() => setShowPicker(true)} className="px-4 py-2 rounded-full text-xs font-black text-white flex-shrink-0" style={{ background: GRADIENT }}>
                    {hasLocation ? 'Alterar' : 'Definir'}
                </button>
            </div>

            {visible && (
                <button onClick={() => router.push('/radar')} className="flex items-center justify-center gap-2 py-2.5 rounded-full text-xs font-black border" style={{ borderColor: colors.border, color: colors.textPrimary }}>
                    <Radar size={14} style={{ color: '#f97316' }} /> Ver no Radar
                </button>
            )}
        </DashboardSection>

        {showPicker && (
                <LocationPicker
                    initialLocation={hasLocation && row ? { lat: row.store_lat as number, lng: row.store_lng as number, address: row.address || 'Local salvo', addressNumber: row.address_number || '', addressComplement: row.address_complement || '' } : null}
                    onSave={saveLocation}
                    onClose={() => setShowPicker(false)}
                    allowDriverSync={false}
                    askRadarVisibility
                />
            )}
        </>
    )
}
