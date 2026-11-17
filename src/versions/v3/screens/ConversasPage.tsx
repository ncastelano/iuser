// src/versions/v3/screens/ConversasPage.tsx — a página /conversas: a tela de conversas de sempre, com a caixa do MODO ativo como padrão.
'use client'

import ConversasScreen from '@/versions/shared/screens/ConversasScreen'
import { useBarStore } from '../bar/kind'

export default function ConversasPage() {
    const store = useBarStore()
    return <div className="relative pb-8"><ConversasScreen basePath="/conversas" defaultRoom={store} /></div>
}
