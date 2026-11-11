// app/(main)/lojas/page.tsx — /lojas na interface 2.0 (lojas-em-destaque redireciona para cá). A tela é a MESMA da 3.0 (versions/shared/screens/LojasScreen): só muda a moldura.
'use client'

import LojasScreen from '@/versions/shared/screens/LojasScreen'

export default function AllStoreList() {
    return <LojasScreen ui="v2" />
}
