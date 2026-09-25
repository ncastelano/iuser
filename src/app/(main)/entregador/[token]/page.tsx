// app/(main)/entregador/[token]/page.tsx
//
// Página pública (sem login) - pra quem recebeu o link "minhas entregas"
// (funcionário fixo ou freelancer/bico) ver as entregas atribuídas a ele, a
// rota otimizada até cada uma, e marcar o progresso (peguei/entreguei). Só
// quem tem o link (o access_token, imprevisível) consegue ver - mesmo
// modelo de /acompanhar-corrida/[id].
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { fetchRoute } from '@/lib/mapboxRoute'
import { MapPin, Package, XCircle, ShieldCheck, CheckCircle2, CreditCard, Banknote } from 'lucide-react'
import { toast } from 'sonner'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const STOP_COLOR = '#f97316'

interface Stop {
    assignmentId: string
    sequence: number
    status: 'pending' | 'in_transit' | 'delivered'
    address: string
    lat: number | null
    lng: number | null
    buyerName: string
    paymentMethod: string
    totalAmount: number
    deliveryFee: number
    items: { productName: string; quantity: number }[]
    pickedUpAt: string | null
    deliveredAt: string | null
}

interface CourierData {
    employee: { name: string }
    store: { name: string; address: string | null; lat: number | null; lng: number | null }
    stops: Stop[]
}

function marker(color: string, label: string): HTMLDivElement {
    const el = document.createElement('div')
    el.style.cssText = 'display:flex;flex-direction:column;align-items:center;'
    el.innerHTML = `
        <div style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:9999px;margin-bottom:4px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.35);">${label}</div>
        <div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>
    `
    return el
}

function paymentLabel(method: string): { text: string; warning: string | null } {
    if (method === 'credit_card') return { text: '💳 Cartão', warning: 'Levar máquina' }
    if (method === 'pix') return { text: '🔷 Pix', warning: null }
    if (method === 'money') return { text: '💵 Dinheiro', warning: 'Levar troco' }
    return { text: method || '—', warning: null }
}

const STATUS_INFO: Record<Stop['status'], { label: string; color: string }> = {
    pending: { label: 'Pendente', color: '#94a3b8' },
    in_transit: { label: 'A caminho', color: '#f59e0b' },
    delivered: { label: 'Entregue', color: '#22c55e' },
}

export default function EntregadorPage() {
    const { colors } = useTheme()
    const params = useParams()
    const token = Array.isArray(params.token) ? params.token[0] : params.token

    const [data, setData] = useState<CourierData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [updatingId, setUpdatingId] = useState<string | null>(null)

    const mapContainerRef = useRef<HTMLDivElement | null>(null)
    const mapBuiltRef = useRef(false)

    const load = useCallback(async () => {
        if (!token) return
        try {
            const res = await fetch(`/api/courier/${token}`)
            if (!res.ok) {
                setError('Link inválido ou expirado.')
                return
            }
            const json = await res.json()
            setData(json)
        } catch {
            setError('Não foi possível carregar suas entregas.')
        } finally {
            setLoading(false)
        }
    }, [token])

    useEffect(() => {
        load()
        const poll = setInterval(load, 15000)
        return () => clearInterval(poll)
    }, [load])

    // Constrói o mapa uma única vez, quando os dados chegam pela primeira
    // vez - atualizações seguintes (polling) só atualizam status na lista,
    // sem refazer a rota (evita chamar a API de rotas de novo a cada 15s).
    useEffect(() => {
        if (mapBuiltRef.current || !data || !mapContainerRef.current) return
        const stopsWithCoords = data.stops.filter((s) => s.lat != null && s.lng != null)
        if (data.store.lat == null || data.store.lng == null || stopsWithCoords.length === 0) return

        mapBuiltRef.current = true
        const origin: [number, number] = [data.store.lng, data.store.lat]

        const map = new mapboxgl.Map({
            container: mapContainerRef.current,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: origin,
            zoom: 13,
            attributionControl: false,
        })
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')

        map.on('load', async () => {
            const bounds = new mapboxgl.LngLatBounds(origin, origin)
            const waypoints: [number, number][] = [origin, ...stopsWithCoords.map((s) => [s.lng!, s.lat!] as [number, number])]
            const legs = await Promise.all(waypoints.slice(0, -1).map((from, i) => fetchRoute(from, waypoints[i + 1])))
            const coords = legs.flatMap((l) => l.coords)

            map.addSource('courier-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } })
            map.addLayer({
                id: 'courier-route-line',
                type: 'line',
                source: 'courier-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': STOP_COLOR, 'line-width': 5, 'line-opacity': 0.9 },
            })
            coords.forEach((c) => bounds.extend(c as [number, number]))

            new mapboxgl.Marker({ element: marker('#22c55e', 'Loja') }).setLngLat(origin).addTo(map)
            stopsWithCoords.forEach((s) => {
                new mapboxgl.Marker({ element: marker(STOP_COLOR, `${s.sequence}`) }).setLngLat([s.lng!, s.lat!]).addTo(map)
                bounds.extend([s.lng!, s.lat!])
            })

            map.fitBounds(bounds, { padding: 60, duration: 0 })
        })

        return () => {
            map.remove()
        }
    }, [data])

    const updateStatus = async (stop: Stop, nextStatus: 'in_transit' | 'delivered') => {
        if (!token || !data) return
        setUpdatingId(stop.assignmentId)
        const previous = data
        setData({ ...data, stops: data.stops.map((s) => (s.assignmentId === stop.assignmentId ? { ...s, status: nextStatus } : s)) })

        try {
            const res = await fetch(`/api/courier/${token}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assignmentId: stop.assignmentId, status: nextStatus }),
            })
            if (!res.ok) throw new Error()
        } catch {
            setData(previous)
            toast.error('Não foi possível atualizar. Tenta de novo.')
        } finally {
            setUpdatingId(null)
        }
    }

    if (loading) {
        return (
            <div className="min-h-dvh flex items-center justify-center" style={{ background: colors.background }}>
                <Spinner size={40} color={colors.accent} />
            </div>
        )
    }

    if (error || !data) {
        return (
            <div className="min-h-dvh flex flex-col items-center justify-center gap-3 px-4 text-center" style={{ background: colors.background }}>
                <XCircle size={40} style={{ color: '#ef4444' }} />
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{error || 'Link inválido.'}</p>
            </div>
        )
    }

    const pendingOrTransit = data.stops.filter((s) => s.status !== 'delivered').length

    return (
        <div className="min-h-dvh px-4 py-8" style={{ background: colors.background }}>
            <div className="max-w-md mx-auto flex flex-col gap-4">
                <div className="flex items-center gap-2 justify-center mb-1">
                    <ShieldCheck size={16} style={{ color: colors.textSecondary }} />
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                        Minhas entregas · iUser
                    </span>
                </div>

                <div className="text-center">
                    <h1 className="text-lg font-black" style={{ color: colors.textPrimary }}>Oi, {data.employee.name}!</h1>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                        {data.store.name} · {pendingOrTransit} entrega{pendingOrTransit === 1 ? '' : 's'} pra fazer
                    </p>
                </div>

                <div
                    ref={mapContainerRef}
                    className="w-full rounded-2xl overflow-hidden"
                    style={{ height: 260, background: '#111', border: `1px solid ${colors.border}` }}
                />

                {data.stops.length === 0 ? (
                    <div className="rounded-2xl p-8 text-center" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                        <Package size={32} className="mx-auto mb-2" style={{ color: colors.textSecondary }} />
                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Nenhuma entrega no momento</p>
                    </div>
                ) : (
                    data.stops.map((stop) => {
                        const payment = paymentLabel(stop.paymentMethod)
                        const status = STATUS_INFO[stop.status]
                        const isUpdating = updatingId === stop.assignmentId
                        return (
                            <div
                                key={stop.assignmentId}
                                className="rounded-2xl p-4"
                                style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white"
                                            style={{ background: STOP_COLOR }}
                                        >
                                            {stop.sequence}
                                        </span>
                                        <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>{stop.buyerName}</span>
                                    </div>
                                    <span
                                        className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                        style={{ background: `${status.color}20`, color: status.color }}
                                    >
                                        {status.label}
                                    </span>
                                </div>

                                <div className="flex items-start gap-2 text-xs mb-2" style={{ color: colors.textPrimary }}>
                                    <MapPin size={13} className="flex-shrink-0 mt-0.5" style={{ color: STOP_COLOR }} />
                                    <span>{stop.address}</span>
                                </div>

                                {stop.items.length > 0 && (
                                    <ul className="text-[11px] list-disc list-inside mb-2" style={{ color: colors.textSecondary }}>
                                        {stop.items.map((item, i) => (
                                            <li key={i}>{item.quantity}x {item.productName}</li>
                                        ))}
                                    </ul>
                                )}

                                <div className="flex items-center gap-2 text-[11px] mb-3" style={{ color: colors.textSecondary }}>
                                    {stop.paymentMethod === 'credit_card' ? <CreditCard size={12} /> : <Banknote size={12} />}
                                    <span>{payment.text} · R$ {Number(stop.totalAmount || 0).toFixed(2)}</span>
                                    {payment.warning && <span className="font-bold" style={{ color: '#ef4444' }}>({payment.warning})</span>}
                                </div>

                                {stop.status !== 'delivered' && (
                                    <div className="flex gap-2">
                                        {stop.status === 'pending' && (
                                            <button
                                                onClick={() => updateStatus(stop, 'in_transit')}
                                                disabled={isUpdating}
                                                className="flex-1 py-2 rounded-full text-xs font-bold disabled:opacity-50"
                                                style={{ background: colors.border, color: colors.textPrimary }}
                                            >
                                                {isUpdating ? <Spinner size={14} /> : 'Peguei o pedido'}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => updateStatus(stop, 'delivered')}
                                            disabled={isUpdating}
                                            className="flex-1 py-2 rounded-full text-xs font-bold text-white disabled:opacity-50 flex items-center justify-center gap-1"
                                            style={{ background: GRADIENT }}
                                        >
                                            {isUpdating ? <Spinner size={14} /> : <><CheckCircle2 size={14} /> Entreguei</>}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )
                    })
                )}

                <p className="text-[10px] text-center" style={{ color: colors.textSecondary }}>
                    Esta página atualiza sozinha a cada 15s.
                </p>
            </div>
        </div>
    )
}
