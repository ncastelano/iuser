// components/checkin/CheckinPrompt.tsx — "ESTOU AQUI" (23/11/2026): quando a pessoa (logada, que JÁ deixou o navegador usar a localização)
// chega a até 120 m de uma loja, pergunta "Você está na <loja>?". Sim = aparece na página da loja por 3 h (check_in_store confere a
// distância de novo). Não pede permissão de localização sozinho; pergunta uma vez por loja por dia; a posição nunca é guardada.
'use client'

import { useEffect, useRef } from 'react'
import { MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from '@/lib/toast'

const EVERY_MS = 90_000
const today = () => new Date().toISOString().slice(0, 10)

async function geoGranted(): Promise<boolean> {
    try {
        const st = await (navigator as any).permissions?.query({ name: 'geolocation' })
        return st?.state === 'granted'
    } catch { return false }
}
const position = () => new Promise<GeolocationPosition | null>((ok) => {
    if (!navigator.geolocation) return ok(null)
    navigator.geolocation.getCurrentPosition(ok, () => ok(null), { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 })
})

export default function CheckinPrompt() {
    const { userId } = useProfile()
    const busy = useRef(false)
    useEffect(() => {
        if (!userId || typeof window === 'undefined') return
        let alive = true
        const tick = async () => {
            if (busy.current || document.hidden || !(await geoGranted())) return
            busy.current = true
            try {
                const pos = await position()
                if (!pos || !alive) return
                const { latitude: lat, longitude: lng } = pos.coords
                const { data } = await supabase.rpc('get_checkin_candidate', { p_lat: lat, p_lng: lng })
                const c = ((data || []) as any[])[0]
                if (!c || c.already_here) return
                const key = `iuser_checkin_ask:${c.store_id}`
                try { if (localStorage.getItem(key) === today()) return; localStorage.setItem(key, today()) } catch { /* sem armazenamento */ }
                const logo = !c.logo_url ? null : /^https?:/.test(c.logo_url) ? c.logo_url : supabase.storage.from('store-logos').getPublicUrl(c.logo_url).data.publicUrl
                toast.custom((id) => (
                    <div className="rounded-3xl p-4 bg-white text-gray-900 shadow-2xl border border-orange-200 w-full">
                        <div className="flex items-center gap-3">
                            <span className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 bg-orange-100 text-orange-500">{logo ? <img src={logo} alt="" className="w-full h-full object-cover" /> : <MapPin size={22} />}</span>
                            <span className="min-w-0">
                                <span className="block text-[15px] font-black leading-tight">Você está na {c.name}?</span>
                                <span className="block text-[12px] text-gray-500">Dizendo que sim, você aparece na página da loja por 3 horas.</span>
                            </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <button onClick={() => toast.dismiss(id)} className="h-11 rounded-full text-[13px] font-black bg-gray-100">Não</button>
                            <button onClick={async () => {
                                toast.dismiss(id)
                                const { error } = await supabase.rpc('check_in_store', { p_store: c.store_id, p_lat: lat, p_lng: lng })
                                if (error) { toast.error(error.message); return }
                                toast.success(`Você está na ${c.name}!`, { action: { label: 'Ver', onClick: () => { window.location.href = `/${c.store_slug}` } } })
                                window.dispatchEvent(new Event('iuser-checkin'))
                            }} className="h-11 rounded-full text-[13px] font-black text-white" style={{ background: 'linear-gradient(135deg,#f97316,#ef4444)' }}>Sim, estou aqui</button>
                        </div>
                    </div>
                ), { title: `Você está na ${c.name}?`, icon: '📍', duration: 30000 })
            } catch { /* tenta de novo na próxima volta */ } finally { busy.current = false }
        }
        const first = setTimeout(tick, 8000)
        const t = setInterval(tick, EVERY_MS)
        return () => { alive = false; clearTimeout(first); clearInterval(t) }
    }, [userId])
    return null
}
