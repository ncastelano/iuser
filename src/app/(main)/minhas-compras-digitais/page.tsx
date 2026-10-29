// app/(main)/minhas-compras-digitais/page.tsx — a biblioteca de quem comprou produto digital (vídeo-aula, curso, e-book...): só aparece o que a loja já liberou.
// Também mora na aba "Digital" do /carrinho; este endereço continua para links e atalhos.
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { Spinner } from '@/components/Spinner'
import DigitalLibrary from '@/components/digital/DigitalLibrary'

export default function MinhasComprasDigitaisPage() {
    const { colors } = useTheme()
    const router = useRouter()
    const { userId, loading } = useProfile()

    useEffect(() => { if (!loading && !userId) router.replace('/login') }, [loading, userId, router])

    if (loading || !userId) {
        return <div className="min-h-dvh flex items-center justify-center" style={{ background: colors.background }}><Spinner size={32} color={colors.accent} /></div>
    }
    return (
        <div className="min-h-dvh px-4 py-6 pb-28" style={{ background: colors.background, paddingTop: 'max(1.5rem, var(--shell-top, 0px))' }}>
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <button type="button" onClick={() => router.back()} aria-label="Voltar" className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><ArrowLeft size={18} /></button>
                    <div>
                        <h1 className="text-xl font-black" style={{ color: colors.textPrimary }}>Minhas compras digitais</h1>
                        <p className="text-[12px]" style={{ color: colors.textSecondary }}>Cursos, aulas e arquivos que você já pode abrir.</p>
                    </div>
                </div>
                <DigitalLibrary userId={userId} />
            </div>
        </div>
    )
}
