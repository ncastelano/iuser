'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Store as StoreIcon, Package } from 'lucide-react'
import { Store, Sale, Profile } from '../types'
import { StoreFlow } from './StoreFlow'

interface PainelVendedorProps {
    stores: Store[]
    sales: Sale[]
    profile: Profile | null
    supabase: any
    onToggleStoreStatus: (storeId: string) => Promise<void>
    onUpdateOrder: () => void
}

export function PainelVendedor({ stores, sales, profile, supabase, onToggleStoreStatus, onUpdateOrder }: PainelVendedorProps) {
    const router = useRouter()

    if (stores.length === 0) {
        return (
            <div className="text-center py-16">
                <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                    <StoreIcon size={32} className="text-orange-500" />
                </div>
                <p className="text-gray-700 font-black uppercase tracking-wider text-sm mb-4">Nenhuma loja criada</p>
                <button onClick={() => router.push('/criar-loja')} className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full font-black uppercase text-xs tracking-wider hover:shadow-lg transition-all">
                    Criar minha primeira loja
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {stores.map(store => (
                <StoreFlow
                    key={store.id}
                    store={store}
                    sales={sales.filter(s => s.store_id === store.id)}
                    supabase={supabase}
                    onToggleStatus={() => onToggleStoreStatus(store.id)}
                    profile={profile}
                    onUpdateOrder={onUpdateOrder}
                />
            ))}
        </div>
    )
}