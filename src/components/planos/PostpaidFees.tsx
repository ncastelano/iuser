// src/components/planos/PostpaidFees.tsx
//
// O que o plano Pós-pago cobra, por tipo de serviço — a fonte única usada no extrato
// (/planos/pos-pago) e na página de planos (/planos). Os preços vêm sempre de
// service_pricing (o admin ajusta cada um), nunca cravados aqui. No Pré-pago e no brinde
// de 90 dias nada disso é cobrado.
'use client'

import { useEffect, useState } from 'react'
import { Car, Wrench, ShoppingBag, Package, Megaphone, CalendarCheck, CalendarPlus, Wallet, Briefcase, Store, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'

export type ChargeType =
    | 'ride_fee' | 'service_fee' | 'service_listing_fee' | 'order_fee' | 'in_person_fee' | 'product_fee' | 'publication_fee'
    | 'schedule_activation_fee' | 'appointment_fee' | 'whatsapp_bot_message_fee' | 'payment'

export const TYPE_INFO: Record<ChargeType, { label: string; plural: string; icon: any; how: string }> = {
    ride_fee: { label: 'Corrida finalizada', plural: 'corridas', icon: Car, how: 'Cada corrida que você finaliza como motorista.' },
    service_listing_fee: { label: 'Serviço publicado', plural: 'serviços publicados', icon: Briefcase, how: 'Cada serviço novo que você publica, no seu perfil ou na sua loja. Publicou, pagou a taxa — uma vez por serviço.' },
    service_fee: { label: 'Serviço aceito', plural: 'serviços', icon: Wrench, how: 'Cada pedido de serviço em que o cliente escolhe você. Se inscrever num pedido não cobra nada: só conta se o cliente aceitar.' },
    order_fee: { label: 'Pedido de loja pago', plural: 'pedidos', icon: ShoppingBag, how: 'Cada pedido pago na sua loja.' },
    in_person_fee: { label: 'Venda presencial', plural: 'vendas presenciais', icon: ShoppingBag, how: 'Cada venda presencial registrada no balcão da loja.' },
    product_fee: { label: 'Produto cadastrado', plural: 'produtos', icon: Package, how: 'Cada produto novo que você adiciona à sua loja ou ao seu perfil.' },
    publication_fee: { label: 'Publicação criada', plural: 'publicações', icon: Megaphone, how: 'Cada publicação nova na sua loja ou no seu perfil.' },
    schedule_activation_fee: { label: 'Agenda ativada', plural: 'ativações de agenda', icon: CalendarPlus, how: 'Ao ativar a agenda da loja ou do perfil (uma única vez em cada).' },
    appointment_fee: { label: 'Agendamento aceito', plural: 'agendamentos', icon: CalendarCheck, how: 'Cada agendamento de cliente que você aceita, na loja ou no perfil.' },
    whatsapp_bot_message_fee: { label: 'Mensagem do bot de WhatsApp', plural: 'mensagens do bot', icon: MessageCircle, how: 'Cada mensagem do bot depois da cota gratuita mensal da Meta — sempre cobrada à parte, em qualquer plano. No Pós-pago conta como um uso normal e entra no saldo; no Pré-pago custa R$ 0,25 por mensagem, fora da mensalidade.' },
    payment: { label: 'Pagamento via Pix', plural: 'pagamentos', icon: Wallet, how: '' },
}

const GROUPS: { title: string; icon: any; types: ChargeType[] }[] = [
    { title: 'Loja', icon: Store, types: ['order_fee', 'in_person_fee', 'product_fee', 'publication_fee'] },
    { title: 'Motorista', icon: Car, types: ['ride_fee'] },
    { title: 'Serviços', icon: Briefcase, types: ['service_listing_fee', 'service_fee'] },
    { title: 'Agenda', icon: CalendarCheck, types: ['schedule_activation_fee', 'appointment_fee'] },
    { title: 'WhatsApp', icon: MessageCircle, types: ['whatsapp_bot_message_fee'] },
]

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
const DEFAULT_PRICE = 0.5

export function PostpaidFees({ className = '' }: { className?: string }) {
    const { colors } = useTheme()
    const [prices, setPrices] = useState<Record<string, number>>({})

    useEffect(() => {
        let cancelled = false
        supabase.from('service_pricing').select('service_type, postpaid_price').then(({ data }) => {
            if (cancelled || !data) return
            setPrices(Object.fromEntries(data.map((r: any) => [r.service_type, Number(r.postpaid_price)])))
        })
        return () => { cancelled = true }
    }, [])

    const card: React.CSSProperties = { background: colors.surface, border: `1px solid ${colors.border}` }

    return (
        <div className={`rounded-2xl p-5 ${className}`} style={card}>
            <h2 className="text-sm font-black mb-1" style={{ color: colors.textPrimary }}>O que o Pós-pago cobra</h2>
            <p className="text-xs mb-4" style={{ color: colors.textSecondary }}>
                Sem mensalidade: você só paga quando usa. Quem está no Pré-pago, ou no brinde de 90 dias, não paga estas taxas — taxa 0% na loja, no motorista e nos serviços. A única exceção são as mensagens do bot de WhatsApp: a Meta cobra depois da cota gratuita, então elas são sempre cobradas à parte (R$ 0,25 por mensagem no Pré-pago).
            </p>

            <div className="flex flex-col gap-4">
                {GROUPS.map((g) => {
                    const GroupIcon = g.icon
                    return (
                        <div key={g.title}>
                            <div className="flex items-center gap-1.5 mb-2">
                                <GroupIcon size={14} style={{ color: '#f97316' }} />
                                <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>{g.title}</p>
                            </div>
                            <div className="flex flex-col gap-2.5">
                                {g.types.map((t) => {
                                    const info = TYPE_INFO[t]
                                    const Icon = info.icon
                                    // O bot de WhatsApp mostra o valor do Pós-pago (R$ 0,50); o do Pré-pago vai no texto
                                    const price = t === 'whatsapp_bot_message_fee' ? (prices.whatsapp_bot_message_fee_postpaid ?? 0.5) : (prices[t] ?? DEFAULT_PRICE)
                                    return (
                                        <div key={t} className="flex items-start gap-3">
                                            <Icon size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#f97316' }} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{info.label}</p>
                                                    <p className="text-sm font-black flex-shrink-0" style={{ color: '#f97316' }}>{brl(price)}</p>
                                                </div>
                                                <p className="text-[11px]" style={{ color: colors.textSecondary }}>{info.how}</p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>

            <p className="text-xs mt-4 font-bold" style={{ color: colors.textPrimary }}>Ao chegar em R$ 50,00</p>
            <p className="text-[11px] mt-1" style={{ color: colors.textSecondary }}>
                Você paga via Pix (ou cartão) e volta a oferecer serviços na hora. Até quitar, o iUser pausa novas corridas, serviços, pedidos, produtos, publicações e agendamentos aceitos.
            </p>
        </div>
    )
}
