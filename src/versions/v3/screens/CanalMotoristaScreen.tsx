'use client'

// CANAL DO MOTORISTA (3.0, /canal-do-motorista) — uma PÁGINA, como Comprar e Social: tudo o que antes ficava solto na home para quem
// dirige (ou pensa em dirigir) mora aqui — os atalhos do motorista, o Outdoor dos motoristas, ativar o modo motorista, as corridas abertas
// com quanto cada uma paga, as candidaturas e a corrida aceita (a mesma seção `AcceptARider` de sempre). Na home fica só o cartão compacto
// (`components/v3/DriverChannelCard`). Página só da 3.0 (V3_ONLY_ROUTES); a 2.0 segue com o Canal dentro da própria home.
import { useRouter } from 'next/navigation'
import { Car, LayoutDashboard, Package, Wallet } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import Header from '@/components/Header'
import AcceptARider from '@/app/(main)/inicio/sections/AcceptARider'

export default function CanalMotoristaScreen() {
    const router = useRouter()
    const { colors } = useTheme()
    const goBack = () => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/') }
    const atalhos = [
        { t: 'Corridas', sub: 'Todas as abertas', ic: Car, cor: '#16a34a', to: '/aceitar-corridas' },
        { t: 'Entregas', sub: 'Pedidos de lojas', ic: Package, cor: '#7c3aed', to: '/entregas' },
        { t: 'Ganhos', sub: 'Hoje, semana e mês', ic: Wallet, cor: '#ea580c', to: '/ganhos' },
        { t: 'Painel', sub: 'Veículo e tarifa', ic: LayoutDashboard, cor: '#2563eb', to: '/painel-motorista' },
    ]
    return (
        <div className="pb-10">
            <Header title="Canal do Motorista" showBack onBack={goBack} />
            <p className="text-[12.5px] mt-1 mb-3 leading-snug" style={{ color: colors.textSecondary }}>Corridas e entregas abertas agora, quanto cada uma paga e tudo para dirigir pelo iUser.</p>
            <div className="grid grid-cols-4 gap-2 mb-5">
                {atalhos.map((a) => {
                    const Icon = a.ic
                    return (
                        <button key={a.t} onClick={() => router.push(a.to)} className="rounded-2xl p-2 flex flex-col items-center gap-1 text-center active:scale-95 transition" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                            <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${a.cor}1f`, color: a.cor }}><Icon size={18} /></span>
                            <span className="text-[12px] font-black leading-tight" style={{ color: colors.textPrimary }}>{a.t}</span>
                            <span className="text-[9.5px] leading-tight" style={{ color: colors.textSecondary }}>{a.sub}</span>
                        </button>
                    )
                })}
            </div>
            <AcceptARider embedded />
        </div>
    )
}
