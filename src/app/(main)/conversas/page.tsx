// app/(main)/conversas/page.tsx — conversas na interface 2.0 (a 3.0 é servida por /v3/conversas; ver src/versions)
import ConversasScreen from '@/versions/shared/screens/ConversasScreen'

export default function ConversasPage() {
    return <ConversasScreen ui="v2" />
}
