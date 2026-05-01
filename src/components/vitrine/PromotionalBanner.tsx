import { Gift } from 'lucide-react'

export function PromotionalBanner() {
    return (
        <div className="mt-12 bg-gradient-to-r from-orange-500 via-red-500 to-yellow-500 rounded-3xl p-6 text-center shadow-xl">
            <div className="flex items-center justify-center gap-2 mb-2">
                <Gift className="w-6 h-6 text-white" />
                <h3 className="text-xl font-black text-white">Ganhe Frete Grátis</h3>
            </div>
            <p className="text-white/90 text-sm mb-3">Nas primeiras 3 compras com pagamento via PIX</p>
            <button className="px-6 py-2 bg-white text-orange-600 rounded-xl font-bold hover:scale-105 transition-transform shadow-md">
                Saiba mais →
            </button>
        </div>
    )
}
