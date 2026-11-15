// src/components/StoreDashboard/StoreDigital.tsx — o bloco DIGITAL do painel da loja (2.0 e 3.0): como vão os cursos, músicas e programas da loja (produtos, vendas, o que espera "Liberar acesso",
// quem pegou de graça, downloads), o Clube (assinantes e pagamentos a conferir) e, logo abaixo, os Apoios recebidos. Só leitura do resumo (get_store_digital_summary, só o dono); sem digital, só convida.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, ChevronRight, Download, GraduationCap, Gift, Package, Users } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { clubLine, digitalAttention, fetchStoreDigitalSummary, hasDigitalActivity, type StoreDigitalSummary } from '@/modules/digital'
import { formatCents } from '@/modules/tips'
import StoreTips from '@/components/tips/StoreTips'

export default function StoreDigital({ storeId, storeSlug, hasPix, v3 = false }: { storeId: string; storeSlug: string; hasPix: boolean; v3?: boolean }) {
    const { colors } = useTheme()
    const router = useRouter()
    const [sum, setSum] = useState<StoreDigitalSummary | null>(null)
    const load = useCallback(async () => { setSum(await fetchStoreDigitalSummary(storeId)) }, [storeId])
    useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load() }, 30000); return () => clearInterval(t) }, [load])

    const gap = 'mb-6'
    // onde se mexe nos produtos e no Clube: na 3.0, em Editar loja; na 2.0 está tudo na mesma página
    const manage = () => router.push(`/editar-loja/${encodeURIComponent(storeSlug)}`)
    const card = { background: colors.surface, border: `1px solid ${colors.border}` } as const
    const soft = `${colors.border}40`

    const Tile = ({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) => (
        <div className="rounded-2xl p-3 flex flex-col gap-1" style={{ background: soft }}>
            <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>{icon}{label}</span>
            <span className="text-[19px] font-black leading-tight" style={{ color: colors.textPrimary }}>{value}</span>
            {hint && <span className="text-[11px]" style={{ color: colors.textSecondary }}>{hint}</span>}
        </div>
    )

    return (
        <>
            {sum && (hasDigitalActivity(sum) ? (
                <section className={`rounded-3xl p-4 flex flex-col gap-3 ${gap}`} style={card} aria-label="Digital">
                    <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: '#7c3aed' }}><GraduationCap size={18} /></span>
                        <div className="min-w-0 flex-1">
                            <h2 className="text-base font-black leading-tight" style={{ color: colors.textPrimary }}>Digital</h2>
                            <p className="text-[11px]" style={{ color: colors.textSecondary }}>Cursos, músicas e programas da loja</p>
                        </div>
                        {digitalAttention(sum) > 0 && <span className="min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-black text-white flex items-center justify-center" style={{ background: '#f97316' }} aria-label={`${digitalAttention(sum)} pedindo atenção`}>{digitalAttention(sum)}</span>}
                    </div>

                    {sum.toRelease > 0 && (
                        <button onClick={() => router.push(`/painel-loja/${encodeURIComponent(storeSlug)}/pedidos`)} className="w-full flex items-center gap-2.5 px-3.5 h-11 rounded-full text-[12.5px] font-black text-white text-left active:scale-[0.98]" style={{ background: '#f97316' }}>
                            <Package size={16} className="flex-shrink-0" />
                            <span className="flex-1 truncate">{sum.toRelease === 1 ? '1 pedido esperando você liberar o acesso' : `${sum.toRelease} pedidos esperando você liberar o acesso`}</span>
                            <ChevronRight size={16} className="flex-shrink-0" />
                        </button>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                        <Tile icon={<GraduationCap size={12} />} label="Produtos" value={String(sum.products)} hint={sum.freeProducts > 0 ? `${sum.freeProducts} grátis · ${sum.items} ${sum.items === 1 ? 'arquivo' : 'arquivos'}` : `${sum.items} ${sum.items === 1 ? 'arquivo' : 'arquivos'}`} />
                        <Tile icon={<Banknote size={12} />} label="Vendas" value={formatCents(sum.revenueCents)} hint={`${sum.paidOrders} ${sum.paidOrders === 1 ? 'pedido pago' : 'pedidos pagos'}`} />
                        <Tile icon={<Gift size={12} />} label="Pegaram de graça" value={String(sum.freeClaims)} />
                        <Tile icon={<Download size={12} />} label="Downloads" value={String(sum.downloads)} hint="de programas" />
                    </div>

                    <div className="rounded-2xl p-3 flex items-center gap-2.5" style={{ background: soft }}>
                        <span className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: '#16a34a' }}><Users size={15} /></span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-black leading-tight" style={{ color: colors.textPrimary }}>{clubLine(sum)}</p>
                            {sum.clubToCheck > 0 && <p className="text-[11px] font-bold" style={{ color: '#c2410c' }}>{sum.clubToCheck === 1 ? '1 pagamento do Clube para conferir' : `${sum.clubToCheck} pagamentos do Clube para conferir`}</p>}
                        </div>
                    </div>

                    {v3 && (
                        <button onClick={manage} className="w-full h-10 rounded-full text-[12px] font-black active:scale-[0.98]" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}>Gerenciar produtos digitais e Clube</button>
                    )}
                </section>
            ) : (
                <section className={`rounded-3xl p-4 flex items-center gap-3 ${gap}`} style={{ ...card, border: `1.5px dashed ${colors.border}` }} aria-label="Digital">
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ background: '#7c3aed' }}><GraduationCap size={19} /></span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-black leading-tight" style={{ color: colors.textPrimary }}>Venda cursos, músicas e programas</p>
                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>Crie um produto do tipo Digital {v3 ? 'em Editar loja' : 'mais abaixo, em Produtos'}; o acesso abre depois que você confirma o pagamento.</p>
                    </div>
                    {v3 && <button onClick={manage} className="h-9 px-3.5 rounded-full text-[12px] font-black text-white flex-shrink-0 active:scale-95" style={{ background: '#f97316' }}>Começar</button>}
                </section>
            ))}
            {/* Apoios recebidos: parte do digital (gorjeta de quem curte o trabalho) */}
            <div className={v3 ? 'mb-6' : ''}>
                <StoreTips storeId={storeId} hasPix={hasPix} v3={v3} />
            </div>
        </>
    )
}
