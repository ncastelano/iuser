// app/(main)/(shell)/canal-do-motorista/page.tsx — o Canal do Motorista: corridas e entregas abertas com quanto cada uma paga
// (aba Canal, também para visitante) e TUDO do antigo painel do motorista (Painel, corridas, Veículo, Tarifa, Avaliações).
import type { Metadata } from 'next'
import CanalMotoristaScreen from '@/versions/v3/screens/CanalMotoristaScreen'
import { pageMetadata } from '@/lib/pageMetadata'

export const metadata: Metadata = pageMetadata({
    title: 'Canal do Motorista',
    description: 'Corridas e entregas abertas agora e quanto cada uma paga. Cadastre carro, moto ou bicicleta, defina a sua tarifa e comece a receber corridas hoje.',
    path: '/canal-do-motorista',
})

export default function CanalDoMotoristaPage() {
    return <CanalMotoristaScreen />
}
