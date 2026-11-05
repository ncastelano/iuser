// app/(main)/(shell)/v3/conversas/page.tsx — as conversas na 3.0 vivem na Atividade (/atividade?aba=conversas): o endereço antigo só leva até lá
import AtividadeLegacy from '@/versions/v3/screens/AtividadeLegacy'

export default function ConversasV3Page() {
    return <AtividadeLegacy fallback="/atividade?aba=conversas" />
}
