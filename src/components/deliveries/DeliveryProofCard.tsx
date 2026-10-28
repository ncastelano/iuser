// src/components/deliveries/DeliveryProofCard.tsx
//
// PROVA DE ENTREGA vista por quem NÃO é o motorista (2.0 e 3.0): o CLIENTE vê o código de 4 dígitos do pedido que saiu da loja (só ele; diz ao entregador na porta) e, depois,
// como foi entregue (com o código ou com a foto que o entregador registrou); a LOJA acompanha o mesmo (sem nunca ver o código). Tudo vem de get_delivery_proof_view (o banco decide
// quem vê o quê); aqui só se apresenta. Some sozinho quando o pedido não é de entrega ou ainda não saiu.
'use client'

import { useEffect, useState } from 'react'
import { Camera, CheckCircle2, DoorOpen, KeyRound } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { supabase } from '@/lib/supabase/client'

interface ProofView { stage: 'waiting' | 'delivering' | 'delivered'; at_door: boolean; pin: string | null; method: 'pin' | 'photo' | null; reason: string | null; photo_path: string | null; proof_at: string | null }
// O cartão do pedido da tela do carrinho é recriado a cada atualização da tela (componente definido dentro dela): guarda a última resposta por pedido (e não repete a consulta em < 5 s)
const cache = new Map<string, { at: number; view: ProofView | null }>()
const REASON: Record<string, string> = { no_answer: 'ninguém atendeu', no_pin: 'o cliente estava sem o código', left_at_door: 'deixado na porta' }

export default function DeliveryProofCard({ orderId, enabled = true, finished = false, role = 'customer', light = false }: { orderId: string; enabled?: boolean; /** o pedido já foi finalizado: não precisa acompanhar */ finished?: boolean; role?: 'customer' | 'store'; light?: boolean }) {
    const { colors } = useTheme()
    const [view, setView] = useState<ProofView | null>(() => cache.get(orderId)?.view ?? null)
    useEffect(() => {
        if (!enabled) return
        let alive = true
        const load = async () => {
            const hit = cache.get(orderId)
            if (hit && Date.now() - hit.at < 5000) { if (alive) setView(hit.view); return }
            const { data } = await supabase.rpc('get_delivery_proof_view', { p_order: orderId })
            const v = (data as ProofView | null) ?? null
            cache.set(orderId, { at: Date.now(), view: v })
            if (alive) setView(v)
        }
        load()
        // pedido já entregue: uma consulta basta; a caminho: acompanha de perto
        const t = finished ? null : setInterval(load, 6000)
        return () => { alive = false; if (t) clearInterval(t) }
    }, [orderId, enabled, finished])

    if (!enabled || !view || view.stage === 'waiting') return null
    const fg = light ? '#111827' : colors.textPrimary, sub = light ? '#6b7280' : colors.textSecondary
    const GREEN = '#22c55e'

    // entregue: como foi
    if (view.method) {
        const photo = view.photo_path ? supabase.storage.from('delivery-proofs').getPublicUrl(view.photo_path).data.publicUrl : null
        return (
            <div className="mx-3.5 mb-3 rounded-2xl px-3 py-2.5 flex items-center gap-3" style={{ background: `${GREEN}14`, border: `1px solid ${GREEN}40` }}>
                {photo ? <a href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Foto da entrega" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" /></a> : <CheckCircle2 size={22} style={{ color: GREEN }} className="flex-shrink-0" />}
                <div className="min-w-0">
                    <p className="text-[12px] font-black" style={{ color: fg }}>{view.method === 'pin' ? 'Entregue com o código do cliente ✓' : 'Entregue — registrado com foto'}</p>
                    {view.method === 'photo' && <p className="text-[11px]" style={{ color: sub }}>{REASON[view.reason || ''] || 'sem o código'} · toque na foto para ampliar</p>}
                </div>
            </div>
        )
    }
    if (view.stage !== 'delivering') return null

    // a caminho: o cliente vê o código; a loja só acompanha
    if (role === 'store') {
        return (
            <div className="mx-3.5 mb-3 rounded-2xl px-3 py-2 text-[12px] font-bold flex items-center gap-2" style={{ background: `${colors.border}30`, color: sub }}>
                {view.at_door ? <><DoorOpen size={15} /> O entregador está na porta, esperando o código do cliente.</> : <><KeyRound size={15} /> A entrega só conclui com o código do cliente (ou a foto do entregador).</>}
            </div>
        )
    }
    if (!view.pin) return null
    return (
        <div className="mx-3.5 mb-3 rounded-2xl px-3.5 py-3" style={{ background: view.at_door ? `${GREEN}18` : '#f9731614', border: `1.5px solid ${view.at_door ? GREEN : '#f9731660'}` }}>
            <p className="text-[10px] font-black uppercase tracking-wide flex items-center gap-1" style={{ color: view.at_door ? '#16a34a' : '#ea580c' }}>
                {view.at_door ? <><DoorOpen size={12} /> O entregador está na porta</> : <><KeyRound size={12} /> Seu código de entrega</>}
            </p>
            <p className="text-4xl font-black tracking-[0.4em] leading-tight" style={{ color: fg }}>{view.pin}</p>
            <p className="text-[11px]" style={{ color: sub }}>Diga o código ao entregador só quando ele chegar. Não mande por mensagem.</p>
        </div>
    )
}
