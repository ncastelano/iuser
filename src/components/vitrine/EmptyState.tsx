import { Building2, Package } from 'lucide-react'

interface EmptyStateProps {
    activeTab: 'stores' | 'products'
}

export function EmptyState({ activeTab }: EmptyStateProps) {
    return (
        <div className="py-16 text-center bg-white rounded-3xl shadow-sm">
            <div className="inline-flex p-4 bg-gradient-to-br from-orange-100 to-red-100 rounded-full mb-4">
                {activeTab === "stores" ? (
                    <Building2 className="w-12 h-12 text-orange-500" />
                ) : (
                    <Package className="w-12 h-12 text-orange-500" />
                )}
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
                Nenhum resultado encontrado
            </h3>
            <p className="text-gray-500">
                😕 Tente buscar por outro termo ou ajustar os filtros
            </p>
        </div>
    )
}