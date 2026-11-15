// app/(main)/(shell)/canal-do-motorista/page.tsx — o Canal do Motorista como página (3.0). Só da 3.0; a 2.0 abre na casca.
import CanalMotoristaScreen from '@/versions/v3/screens/CanalMotoristaScreen'

export const metadata = { title: 'Canal do Motorista | iUser' }

export default function CanalDoMotoristaPage() {
    return <CanalMotoristaScreen />
}
