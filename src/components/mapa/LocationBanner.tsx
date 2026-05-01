import { MapPin, Edit2, XCircle, Plus, Compass } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface LocationBannerProps {
    isLoggedIn: boolean
    profileLocation: { lat: number; lng: number } | null
    userAddress: string | null
    onEditClick: () => void
    onAddClick: () => void
    onRemoveClick: () => void
}

export function LocationBanner({
    isLoggedIn,
    profileLocation,
    userAddress,
    onEditClick,
    onAddClick,
    onRemoveClick
}: LocationBannerProps) {
    const router = useRouter()

    if (!isLoggedIn) {
        return (
            <div className="absolute left-6 z-20" style={{ bottom: '85px' }}>
                <div className="bg-gray-500 rounded-2xl px-4 py-2.5 shadow-xl flex items-center gap-2 backdrop-blur-md border border-white/20 w-fit">
                    <XCircle className="w-4 h-4 text-white" />
                    <span className="text-xs font-bold text-white">Você não está logado</span>
                    <button
                        onClick={() => router.push('/login')}
                        className="ml-2 px-2 py-1 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                    >
                        Entrar
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="absolute left-6 z-20" style={{ bottom: '85px', maxWidth: 'calc(100vw - 80px)' }}>
            <div className={`${profileLocation ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-orange-500'} rounded-2xl px-4 py-2.5 shadow-xl flex items-center gap-2 backdrop-blur-md border border-white/20 w-fit`}>
                {profileLocation ? (
                    <>
                        <MapPin className="w-4 h-4 text-white" />
                        <span className="text-xs font-black text-white tracking-tight">
                            {userAddress?.split(',').slice(0, 2).join(',') || 'Localização salva'}
                        </span>
                        <button
                            onClick={onEditClick}
                            className="ml-2 p-1 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
                            title="Editar localização"
                        >
                            <Edit2 className="w-3 h-3 text-white" />
                        </button>
                        <button
                            onClick={onRemoveClick}
                            className="ml-1 p-1 bg-white/20 rounded-lg hover:bg-red-300/30 transition-colors"
                            title="Remover localização"
                        >
                            <XCircle className="w-3 h-3 text-white" />
                        </button>
                    </>
                ) : (
                    <>
                        <Compass className="w-4 h-4 text-white" />
                        <span className="text-xs font-bold text-white">Localização não definida</span>
                        <button
                            onClick={onAddClick}
                            className="ml-2 px-2 py-1 bg-white/20 rounded-lg hover:bg-white/30 transition-colors flex items-center gap-1"
                        >
                            <Plus className="w-3 h-3 text-white" />
                            <span className="text-[10px] font-bold text-white">Adicionar</span>
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}