// app/(main)/planos/pos-pago/page.tsx
//
// Detalhes do plano Pós-pago: como funciona, quanto já foi acumulado e o extrato
// de cada serviço que gerou cobrança (corrida, serviço, pedido, produto, etc.).
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/components/Header'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import DriverDebtBanner from '@/components/DriverDebtBanner'
import { Spinner } from '@/components/Spinner'
import { Car, Wrench, ShoppingBag, Package, Megaphone, CalendarCheck, CalendarPlus, Wallet, Info } from 'lucide-react'

export const dynamic = 'force-dynamic'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'
const DEBT_LIMIT = 50
const MAX_ROWS = 1000

type ChargeType =
    | 'ride_fee' | 'service_fee' | 'order_fee' | 'in_person_fee' | 'product_fee' | 'publication_fee'
    | 'schedule_activation_fee' | 'appointment_fee' | 'payment'

interface Charge {
    id: string
    type: ChargeType
    amount: number
    created_at: string
    ride_request_id: string | null
    order_id: string | null
    product_id: string | null
    appointment_id: string | null
    store_id: string | null
}

const TYPE_INFO: Record<ChargeType, { label: string; plural: string; icon: any; how: string }> = {
    ride_fee: { label: 'Corrida finalizada', plural: 'corridas', icon: Car, how: 'Cada corrida que você finaliza como motorista.' },
    service_fee: { label: 'Serviço aceito', plural: 'serviços', icon: Wrench, how: 'Cada serviço em que o cliente aceita a sua candidatura.' },
    order_fee: { label: 'Pedido de loja pago', plural: 'pedidos', icon: ShoppingBag, how: 'Cada pedido pago na sua loja.' },
    in_person_fee: { label: 'Venda presencial', plural: 'vendas presenciais', icon: ShoppingBag, how: 'Cada venda presencial registrada no balcão da loja.' },
    product_fee: { label: 'Produto cadastrado', plural: 'produtos', icon: Package, how: 'Cada produto novo que você adiciona à sua loja ou ao seu perfil.' },
    publication_fee: { label: 'Publicação criada', plural: 'publicações', icon: Megaphone, how: 'Cada publicação nova na sua loja ou no seu perfil.' },
    schedule_activation_fee: { label: 'Agenda ativada', plural: 'ativações de agenda', icon: CalendarPlus, how: 'Ao ativar a agenda da loja ou do perfil (uma única vez em cada).' },
    appointment_fee: { label: 'Agendamento aceito', plural: 'agendamentos', icon: CalendarCheck, how: 'Cada agendamento de cliente que você aceita, na loja ou no perfil.' },
    payment: { label: 'Pagamento via Pix', plural: 'pagamentos', icon: Wallet, how: '' },
}

const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const short = (addr?: string | null) => (addr || '').split(',')[0]

export default function PosPagoPage() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, avatarUrl, bgMode, customBgUrl, profileSlug, loading: profileLoading } = useProfile()

    const [loading, setLoading] = useState(true)
    const [isPostpaid, setIsPostpaid] = useState(false)
    const [charges, setCharges] = useState<Charge[]>([])
    const [details, setDetails] = useState<Record<string, string>>({})

    useEffect(() => {
        if (profileLoading) return
        if (!userId) { setLoading(false); return }
        let cancelled = false

        const load = async () => {
            const [{ data: post }, { data: rows }] = await Promise.all([
                supabase.rpc('is_postpaid_user', { p_user_id: userId }),
                supabase
                    .from('driver_postpaid_charges')
                    .select('id, type, amount, created_at, ride_request_id, order_id, product_id, appointment_id, store_id')
                    .eq('driver_id', userId)
                    .order('created_at', { ascending: false })
                    .limit(MAX_ROWS),
            ])
            if (cancelled) return
            const list = ((rows || []) as Charge[]).map((r) => ({ ...r, amount: Number(r.amount) }))
            setIsPostpaid(!!post)
            setCharges(list)
            setLoading(false)

            // Descrições (melhor esforço: o que a pessoa não puder ler vira o rótulo genérico).
            const recent = list.slice(0, 100)
            const ids = (key: keyof Charge) => [...new Set(recent.map((r) => r[key] as string | null).filter(Boolean))] as string[]
            const [rides, products, appts, stores] = await Promise.all([
                ids('ride_request_id').length ? supabase.from('ride_requests').select('id, origin_address, destination_address').in('id', ids('ride_request_id')) : { data: [] },
                ids('product_id').length ? supabase.from('products').select('id, name').in('id', ids('product_id')) : { data: [] },
                ids('appointment_id').length ? supabase.from('appointments').select('id, service_name, date, time').in('id', ids('appointment_id')) : { data: [] },
                ids('store_id').length ? supabase.from('stores').select('id, name').in('id', ids('store_id')) : { data: [] },
            ])
            if (cancelled) return
            const map: Record<string, string> = {}
            for (const r of (rides.data || []) as any[]) map[`ride:${r.id}`] = `${short(r.origin_address)} → ${short(r.destination_address)}`
            for (const r of (products.data || []) as any[]) map[`product:${r.id}`] = r.name
            for (const r of (appts.data || []) as any[]) map[`appt:${r.id}`] = `${r.service_name || 'Agendamento'}${r.date ? ` · ${String(r.date).split('-').reverse().join('/')}${r.time ? ` ${String(r.time).slice(0, 5)}` : ''}` : ''}`
            for (const r of (stores.data || []) as any[]) map[`store:${r.id}`] = r.name
            setDetails(map)
        }
        load()
        return () => { cancelled = true }
    }, [userId, profileLoading])

    const debt = useMemo(() => charges.reduce((sum, c) => sum + c.amount, 0), [charges])
    const progress = Math.min(100, Math.max(0, (debt / DEBT_LIMIT) * 100))

    const summary = useMemo(() => {
        const acc = new Map<ChargeType, { count: number; total: number }>()
        for (const c of charges) {
            const cur = acc.get(c.type) || { count: 0, total: 0 }
            acc.set(c.type, { count: cur.count + 1, total: cur.total + c.amount })
        }
        return [...acc.entries()].sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total))
    }, [charges])

    const describe = (c: Charge) => {
        if (c.ride_request_id && details[`ride:${c.ride_request_id}`]) return details[`ride:${c.ride_request_id}`]
        if (c.product_id && details[`product:${c.product_id}`]) return details[`product:${c.product_id}`]
        if (c.appointment_id && details[`appt:${c.appointment_id}`]) return details[`appt:${c.appointment_id}`]
        if (c.store_id && details[`store:${c.store_id}`]) return details[`store:${c.store_id}`]
        if (c.order_id) return `Pedido #${c.order_id.slice(0, 8)}`
        return null
    }

    const card = { background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow } as const

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>

            <main className="relative z-10 min-h-dvh">
                <Header
                    title="Pós-pago"
                    showBack={true}
                    onBack={() => router.push('/planos')}
                    greeting={`Olá, ${profileLoading ? '...' : profileSlug ? `@${profileSlug}` : 'Visitante'}`}
                    avatarUrl={avatarUrl}
                    loading={profileLoading}
                />

                <section className="px-4 md:px-6 mt-4 pb-24 max-w-2xl mx-auto flex flex-col gap-5">
                    <div>
                        <h1 className="text-2xl font-black" style={{ color: colors.textPrimary }}>Plano Pós-pago</h1>
                        <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                            Sem mensalidade. Você usa R$ 0,50 de crédito a cada serviço realizado e paga via Pix quando o total chegar a R$ 50,00.
                        </p>
                    </div>

                    {loading || profileLoading ? (
                        <div className="flex justify-center py-10"><Spinner size={24} color={colors.textSecondary} /></div>
                    ) : !userId ? (
                        <div className="rounded-2xl p-5 text-center" style={card}>
                            <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Entre na sua conta para ver o seu extrato</p>
                            <Link href="/planos" className="inline-block mt-3 px-5 py-2.5 rounded-full text-sm font-black text-white" style={{ background: GRADIENT }}>
                                Ver planos
                            </Link>
                        </div>
                    ) : (
                        <>
                            {/* Saldo acumulado */}
                            <div className="rounded-2xl p-5" style={card}>
                                <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Acumulado até agora</p>
                                <p className="text-4xl font-black mt-1" style={{ color: debt >= DEBT_LIMIT ? '#ef4444' : colors.textPrimary }}>{brl(Math.max(0, debt))}</p>
                                <div className="h-2.5 rounded-full mt-3 overflow-hidden" style={{ background: `${colors.border}55` }}>
                                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: debt >= DEBT_LIMIT ? '#ef4444' : GRADIENT }} />
                                </div>
                                <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>
                                    {debt >= DEBT_LIMIT
                                        ? 'Você chegou ao limite de R$ 50,00: quite para voltar a oferecer serviços.'
                                        : `Faltam ${brl(Math.max(0, DEBT_LIMIT - debt))} para o limite de ${brl(DEBT_LIMIT)}.`}
                                </p>
                            </div>

                            <DriverDebtBanner userId={userId} />

                            {!isPostpaid && charges.length === 0 && (
                                <div className="rounded-2xl p-5 flex gap-3" style={card}>
                                    <Info size={18} className="flex-shrink-0 mt-0.5" style={{ color: '#f97316' }} />
                                    <div>
                                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>Você ainda não está no plano Pós-pago</p>
                                        <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Ative em Planos: sem mensalidade, só R$ 0,50 por serviço.</p>
                                        <Link href="/planos" className="inline-block mt-3 px-5 py-2 rounded-full text-xs font-black text-white" style={{ background: GRADIENT }}>
                                            Ver planos
                                        </Link>
                                    </div>
                                </div>
                            )}

                            {/* Resumo por tipo */}
                            {summary.length > 0 && (
                                <div className="rounded-2xl p-5" style={card}>
                                    <h2 className="text-sm font-black mb-3" style={{ color: colors.textPrimary }}>Onde foram usados os créditos</h2>
                                    <div className="flex flex-col gap-2.5">
                                        {summary.map(([type, s]) => {
                                            const info = TYPE_INFO[type]
                                            const Icon = info.icon
                                            return (
                                                <div key={type} className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: type === 'payment' ? '#22c55e22' : '#f9731622', color: type === 'payment' ? '#22c55e' : '#f97316' }}>
                                                        <Icon size={16} />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{info.label}</p>
                                                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>{s.count} {s.count === 1 ? 'vez' : 'vezes'}</p>
                                                    </div>
                                                    <p className="text-sm font-black" style={{ color: s.total < 0 ? '#22c55e' : colors.textPrimary }}>{s.total < 0 ? '−' : ''}{brl(Math.abs(s.total))}</p>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Extrato */}
                            <div className="rounded-2xl p-5" style={card}>
                                <h2 className="text-sm font-black mb-3" style={{ color: colors.textPrimary }}>Extrato</h2>
                                {charges.length === 0 ? (
                                    <p className="text-xs" style={{ color: colors.textSecondary }}>Nenhum serviço cobrado ainda. Quando você oferecer um serviço, ele aparece aqui.</p>
                                ) : (
                                    <div className="flex flex-col">
                                        {charges.slice(0, 100).map((c) => {
                                            const info = TYPE_INFO[c.type]
                                            const Icon = info.icon
                                            const detail = describe(c)
                                            return (
                                                <div key={c.id} className="flex items-center gap-3 py-2.5 border-b last:border-0" style={{ borderColor: `${colors.border}66` }}>
                                                    <Icon size={16} className="flex-shrink-0" style={{ color: c.type === 'payment' ? '#22c55e' : '#f97316' }} />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>{info.label}</p>
                                                        <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>{detail ? `${detail} · ` : ''}{fmtDate(c.created_at)}</p>
                                                    </div>
                                                    <p className="text-sm font-black flex-shrink-0" style={{ color: c.amount < 0 ? '#22c55e' : colors.textPrimary }}>
                                                        {c.amount < 0 ? '−' : '+'}{brl(Math.abs(c.amount))}
                                                    </p>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                                {charges.length > 100 && (
                                    <p className="text-[11px] mt-3 text-center" style={{ color: colors.textSecondary }}>Mostrando os 100 lançamentos mais recentes.</p>
                                )}
                            </div>

                            {/* O que gera cobrança */}
                            <div className="rounded-2xl p-5" style={card}>
                                <h2 className="text-sm font-black mb-1" style={{ color: colors.textPrimary }}>O que consome R$ 0,50</h2>
                                <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>Só quem está no plano Pós-pago é cobrado. Quem tem plano mensal não paga por serviço.</p>
                                <div className="flex flex-col gap-2.5">
                                    {(Object.keys(TYPE_INFO) as ChargeType[]).filter((t) => t !== 'payment').map((t) => {
                                        const Icon = TYPE_INFO[t].icon
                                        return (
                                            <div key={t} className="flex items-start gap-3">
                                                <Icon size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#f97316' }} />
                                                <div>
                                                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{TYPE_INFO[t].label}</p>
                                                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>{TYPE_INFO[t].how}</p>
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
                        </>
                    )}
                </section>
            </main>
        </div>
    )
}
