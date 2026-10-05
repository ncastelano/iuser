// components/VehicleRequiredDialog.tsx
//
// Aviso ao tentar se candidatar a uma corrida sem ter veículo cadastrado.
'use client'

import { Car, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface VehicleRequiredDialogProps {
    onRegister: () => void
    onClose: () => void
}

export function VehicleRequiredDialog({ onRegister, onClose }: VehicleRequiredDialogProps) {
    const { colors } = useTheme()
    return (
        <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
        >
            <div
                className="w-full max-w-sm rounded-3xl p-6 flex flex-col items-center text-center gap-4 relative"
                style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: colors.shadow }}
                onClick={(e) => e.stopPropagation()}
            >
                <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${colors.border}30`, color: colors.textSecondary }} aria-label="Fechar">
                    <X size={16} />
                </button>
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: GRADIENT, color: '#fff' }}>
                    <Car size={30} />
                </div>
                <div>
                    <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>Cadastre seu veículo primeiro</h2>
                    <p className="text-sm mt-1.5" style={{ color: colors.textSecondary }}>
                        Pra se candidatar a uma corrida, o passageiro precisa saber com que veículo você vai. Leva só um minutinho: modelo, placa e uma foto.
                    </p>
                </div>
                <div className="w-full flex flex-col gap-2">
                    <button
                        onClick={onRegister}
                        className="w-full py-3 rounded-full text-sm font-black"
                        style={{ background: GRADIENT, color: '#fff', boxShadow: '0 4px 12px #f9731640' }}
                    >
                        Cadastrar veículo
                    </button>
                    <button onClick={onClose} className="w-full py-2 text-xs font-semibold" style={{ color: colors.textSecondary }}>
                        Agora não
                    </button>
                </div>
            </div>
        </div>
    )
}
