// components/StoreAccessGate.tsx
'use client'

import Link from 'next/link'
import { Store, ArrowRight } from 'lucide-react'
import { Spinner } from '@/components/Spinner'
import { useActivePlans } from '@/hooks/useActivePlans'

interface StoreAccessGateProps {
    userId: string | null
    children: React.ReactNode
}

// Trava a criação de loja atrás de uma assinatura ativa do plano Loja ou
// Combo — o mesmo get_active_plan_grants que já trava "manter a loja
// aberta pra vender" em Store.tsx. Substituiu o paywall antigo de taxa
// única (PIX manual confirmado pelo admin, ou código de liberação): a
// função dos planos passou a cobrir criação e manutenção da loja com o
// mesmo gate. Envolve o formulário de criar loja nos 3 pontos de entrada.
export function StoreAccessGate({ userId, children }: StoreAccessGateProps) {
    const { loading, hasStore } = useActivePlans(userId)

    if (loading) {
        return (
            <div className="w-full flex items-center justify-center py-16">
                <Spinner size={32} color="#f97316" />
            </div>
        )
    }

    if (hasStore) {
        return <>{children}</>
    }

    return (
        <div className="w-full max-w-md mx-auto space-y-4 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                <Store className="w-7 h-7 text-white" />
            </div>
            <div className="space-y-1">
                <h2 className="text-lg font-black text-gray-800">Crie sua loja no iUser</h2>
                <p className="text-xs text-gray-500">
                    Escolha o plano Loja ou Combo para começar a vender.
                </p>
            </div>
            <Link
                href="/planos?plan=loja"
                className="w-full inline-flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all"
            >
                VER PLANOS
                <ArrowRight className="w-4 h-4" />
            </Link>
        </div>
    )
}
