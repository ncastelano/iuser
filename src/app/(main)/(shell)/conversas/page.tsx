// app/(main)/(shell)/conversas/page.tsx — as conversas vivem na Atividade (/atividade?aba=conversas): o endereço antigo só leva até lá
import AtividadeLegacy from '@/versions/v3/screens/AtividadeLegacy'

export default function ConversasV3Page() {
    return <AtividadeLegacy fallback="/atividade?aba=conversas" />
}
