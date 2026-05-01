import { Store, Package } from 'lucide-react'

interface VitrineTabsProps {
    activeTab: 'stores' | 'products'
    onTabChange: (tab: 'stores' | 'products') => void
    storesCount: number
    productsCount: number
}

export function VitrineTabs({ activeTab, onTabChange, storesCount, productsCount }: VitrineTabsProps) {
    return (
        <div className="sticky top-[73px] sm:top-[81px] z-40 bg-white shadow-md">
            <div className="px-4 sm:px-6 lg:px-8">
                <div className="flex gap-2">
                    <button
                        onClick={() => onTabChange("stores")}
                        className={`flex items-center gap-2 px-5 sm:px-7 py-3.5 text-sm font-bold transition-all relative ${activeTab === "stores"
                                ? "text-orange-600"
                                : "text-gray-500 hover:text-orange-500"
                            }`}
                    >
                        <Store className="w-4 h-4" />
                        <span>Lojas</span>
                        <span className="text-xs font-normal ml-1 bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                            {storesCount}
                        </span>
                        {activeTab === "stores" && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-full"></div>
                        )}
                    </button>
                    <button
                        onClick={() => onTabChange("products")}
                        className={`flex items-center gap-2 px-5 sm:px-7 py-3.5 text-sm font-bold transition-all relative ${activeTab === "products"
                                ? "text-orange-600"
                                : "text-gray-500 hover:text-orange-500"
                            }`}
                    >
                        <Package className="w-4 h-4" />
                        <span>Produtos e Serviços</span>
                        <span className="text-xs font-normal ml-1 bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                            {productsCount}
                        </span>
                        {activeTab === "products" && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-full"></div>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}