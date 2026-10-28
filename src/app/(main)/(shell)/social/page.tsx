// app/(main)/(shell)/social/page.tsx — Social: a parte social do iUser (flash, publicações, gente perto, melhores perfis, quem eu sigo...). Abre na casca da 3.0.
import { Suspense } from 'react'
import SocialScreen from '@/versions/v3/screens/SocialScreen'

export default function SocialPage() {
    // A aba vem da URL (?aba=melhores|sigo|seguem|novos), então a tela lê os parâmetros: precisa do Suspense
    return <Suspense fallback={null}><SocialScreen /></Suspense>
}
