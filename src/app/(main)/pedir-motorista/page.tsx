// app/(main)/pedir-motorista/page.tsx — /pedir-motorista na interface 2.0 (a 3.0 é servida por app/(main)/(shell)/v3/pedir-motorista)
import PedirMotoristaScreen from '@/versions/shared/screens/PedirMotoristaScreen'

export default function PedirMotoristaPage() {
    return <PedirMotoristaScreen ui="v2" />
}
