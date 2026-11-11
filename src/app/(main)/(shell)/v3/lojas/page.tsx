// app/(main)/(shell)/v3/lojas/page.tsx — /lojas na interface 3.0 (o proxy serve isto em /lojas). A tela é a MESMA da 2.0 (versions/shared/screens/LojasScreen): só muda a moldura.
import LojasScreen from '@/versions/shared/screens/LojasScreen'

export default function LojasV3Page() {
    return <LojasScreen ui="v3" />
}
