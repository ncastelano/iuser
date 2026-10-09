// Localização em "Informações do Perfil": onde a pessoa está (LocationPicker) e o que ela deixa aparecer:
// no perfil (chave geral — desligada, não aparece em lugar nenhum), no mapa (Radar), no Social e em tempo real.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'
import LocationPicker from '@/components/LocationPicker'
import DashboardSection from './DashboardSection'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface LocRow {
    address: string | null
    address_number: string | null
    address_complement: string | null
    store_lat: number | null
    store_lng: number | null
    show_location: boolean | null
    show_on_map: boolean | null
    show_in_social: boolean | null
    live_location: boolean | null
}

type FlagKey = 'show_location' | 'show_on_map' | 'show_in_social' | 'live_location'

export default function ProfileLocationSettings({ profileId }: { profileId: string }) {
    const { colors } = useTheme()
    const [row, setRow] = useState<LocRow | null>(null)
    const [showPicker, setShowPicker] = useState(false)
    const [busy, setBusy] = useState<FlagKey | 'loc' | null>(null)

    const load = useCallback(async () => {
        const { data } = await supabase
            .from('profiles')
            .select('address, address_number, address_complement, store_lat, store_lng, show_location, show_on_map, show_in_social, live_location')
            .eq('id', profileId)
            .maybeSingle()
        setRow((data as LocRow) || null)
    }, [profileId])
    useEffect(() => { load() }, [load])

    const flag = (key: FlagKey, fallback: boolean) => (row?.[key] ?? fallback)
    const master = flag('show_location', true)

    const saveFlag = async (key: FlagKey, next: boolean) => {
        if (!row) return
        setBusy(key)
        try {
            if (key === 'live_location') {
                if (next) {
                    // Pede a permissão do aparelho antes de ligar
                    await new Promise<void>((resolve, reject) => {
                        if (!navigator.geolocation) { reject(new Error('Este aparelho não consegue informar a localização')); return }
                        navigator.geolocation.getCurrentPosition(() => resolve(), () => reject(new Error('Permita o acesso à localização do aparelho para usar o tempo real')), { timeout: 10000 })
                    })
                }
                const { error } = await supabase.rpc('set_live_location_enabled', { p_on: next })
                if (error) throw error
                window.dispatchEvent(new CustomEvent('iuser:live-location', { detail: next }))
            } else {
                const { error } = await supabase.from('profiles').update({ [key]: next }).eq('id', profileId)
                if (error) throw error
                // Chave geral desligada: o tempo real também para
                if (key === 'show_location' && !next && row.live_location) {
                    await supabase.rpc('set_live_location_enabled', { p_on: false })
                    window.dispatchEvent(new CustomEvent('iuser:live-location', { detail: false }))
                    setRow((prev) => (prev ? { ...prev, live_location: false } : prev))
                }
            }
            setRow((prev) => (prev ? { ...prev, [key]: next } : prev))
            toast.success('Preferência salva')
        } catch (err: any) {
            toast.error(err.message || 'Não foi possível salvar')
        }
        setBusy(null)
    }

    const saveLocation = async (loc: { lat: number; lng: number; address: string; addressNumber: string; addressComplement: string }) => {
        setBusy('loc')
        const { error } = await supabase.from('profiles').update({
            address: loc.address,
            address_number: loc.addressNumber || null,
            address_complement: loc.addressComplement || null,
            store_lat: loc.lat,
            store_lng: loc.lng,
        }).eq('id', profileId)
        setBusy(null)
        setShowPicker(false)
        if (error) { toast.error('Erro ao salvar a localização: ' + error.message); return }
        toast.success('Localização salva')
        load()
    }

    const clearLocation = async () => {
        const { error } = await supabase.from('profiles').update({ address: null, address_number: null, address_complement: null, store_lat: null, store_lng: null }).eq('id', profileId)
        setShowPicker(false)
        if (error) { toast.error(error.message); return }
        toast.success('Localização removida')
        load()
    }

    const toggles: { key: FlagKey; title: string; text: string; fallback: boolean; needsMaster: boolean }[] = [
        { key: 'show_location', title: 'Mostrar no meu perfil', text: 'Chave geral. Desligada, a localização não aparece em lugar nenhum.', fallback: true, needsMaster: false },
        { key: 'show_on_map', title: 'Aparecer no mapa', text: 'Seus serviços aparecem no mapa (Radar).', fallback: true, needsMaster: true },
        { key: 'show_in_social', title: 'Mostrar no Social', text: 'O endereço aparece no seu cartão do Social.', fallback: true, needsMaster: true },
        { key: 'live_location', title: 'Localização em tempo real', text: 'Mostra a sua posição de agora (aproximada, ~100 m) no perfil enquanto o app estiver aberto.', fallback: false, needsMaster: true },
    ]

    const addressLine = row?.address
        ? [row.address.split(',').slice(0, 2).join(','), row.address_number].filter(Boolean).join(', ')
        : null

    const summary = !row ? '' : [
        addressLine || 'Sem localização definida',
        master ? `perfil sim · mapa ${flag('show_on_map', true) ? 'sim' : 'não'} · Social ${flag('show_in_social', true) ? 'sim' : 'não'}` : 'oculta',
    ].join(' · ')

    return (
        <DashboardSection storageKey="config-localizacao" title="Configurações de localização" subtitle="Onde você está e quem pode ver" collapsedSummary={summary}>
            <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ border: `1px solid ${colors.border}` }}>
                <span className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: GRADIENT }}><MapPin size={18} /></span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black truncate" style={{ color: colors.textPrimary }}>{addressLine || 'Sem localização definida'}</p>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                        {row?.store_lat != null ? 'Localização no mapa definida' : 'Defina para aparecer perto de quem procura'}
                    </p>
                </div>
                <button
                    onClick={() => setShowPicker(true)}
                    disabled={busy === 'loc'}
                    className="px-4 py-2 rounded-full text-xs font-black text-white flex-shrink-0 disabled:opacity-60"
                    style={{ background: GRADIENT }}
                >
                    {row?.address ? 'Alterar' : 'Definir'}
                </button>
            </div>

            <div className="flex flex-col gap-2">
                {toggles.map((t) => {
                    const disabled = t.needsMaster && !master
                    const on = !disabled && flag(t.key, t.fallback)
                    return (
                        <div key={t.key} className="flex items-center justify-between gap-3 p-3 rounded-2xl" style={{ border: `1px solid ${colors.border}`, opacity: disabled ? 0.55 : 1 }}>
                            <div className="min-w-0">
                                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{t.title}</p>
                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>{t.text}</p>
                            </div>
                            <button
                                onClick={() => saveFlag(t.key, !flag(t.key, t.fallback))}
                                disabled={disabled || busy === t.key || !row}
                                aria-label={t.title}
                                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:cursor-not-allowed ${on ? 'bg-orange-500' : 'bg-gray-400'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${on ? 'right-1' : 'left-1'}`} />
                            </button>
                        </div>
                    )
                })}
            </div>

            {showPicker && (
                <LocationPicker
                    initialLocation={row?.store_lat != null && row?.store_lng != null
                        ? { lat: row.store_lat, lng: row.store_lng, address: row.address || 'Local salvo', addressNumber: row.address_number || '', addressComplement: row.address_complement || '' }
                        : null}
                    onSave={saveLocation}
                    onClose={() => setShowPicker(false)}
                    allowDriverSync={false}
                    onClear={row?.address ? clearLocation : undefined}
                />
            )}
        </DashboardSection>
    )
}
