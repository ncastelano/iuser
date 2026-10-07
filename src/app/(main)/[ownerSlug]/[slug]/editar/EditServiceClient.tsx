// src/app/(main)/[ownerSlug]/[slug]/editar/EditServiceClient.tsx
//
// /<perfil>/<serviço>/editar: abre o mesmo diálogo de edição de serviço usado em
// "Meus serviços" e no perfil (EditServiceDialog), sobre o fundo do app. Fechar volta
// pra onde a pessoa estava.
'use client'

import { useRouter } from 'next/navigation'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import AnimatedBackgroundiUser from '@/components/AnimatedBackground'
import EditServiceDialog from '@/components/EditServiceDialog'

export function EditServiceClient({ product, ownerSlug }: { product: any; ownerSlug: string }) {
    const router = useRouter()
    const { colors } = useTheme()
    const { bgMode, customBgUrl } = useProfile()

    return (
        <div className="relative min-h-dvh" style={{ background: colors.background }}>
            <div className="fixed inset-0 z-0">
                <AnimatedBackgroundiUser bgMode={bgMode} customBgUrl={customBgUrl} />
            </div>
            <EditServiceDialog
                productId={product.id}
                colors={colors}
                onClose={() => router.back()}
                onSaved={(updated) => router.push(`/${ownerSlug}/${updated.slug}`)}
                onDeleted={() => router.push('/meus-servicos')}
            />
        </div>
    )
}
