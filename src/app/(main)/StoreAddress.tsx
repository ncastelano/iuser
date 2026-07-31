// src/components/StoreAddress.tsx
'use client'

import { MapPin, Phone, Store } from 'lucide-react'
import { useTheme } from '@/app/theme'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.5rem 1rem',
    borderRadius: '9999px',
    fontWeight: 600,
    fontSize: '0.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
    textDecoration: 'none',
}

interface StoreAddressProps {
    address?: string | null
    whatsapp?: string | null
}

export default function StoreAddress({ address, whatsapp }: StoreAddressProps) {
    const { colors } = useTheme()
    const surfaceRgb = hexToRgb(colors.surface)

    if (!address && !whatsapp) return null

    const cleanWhatsapp = whatsapp?.replace(/\D/g, '') || null
    const whatsappLink = cleanWhatsapp ? `https://wa.me/${cleanWhatsapp}` : null

    return (
        <div
            className="rounded-2xl p-6 flex flex-col gap-5 relative"
            style={{
                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: `1px solid ${colors.border}`,
                boxShadow: colors.shadow,
            }}
        >
            <div className="flex items-center gap-4 w-full">
                <div
                    className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                        background: GRADIENT,
                        color: '#ffffff',
                    }}
                >
                    <MapPin size={28} />
                </div>

                <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                        Endereço da Loja
                    </h3>
                    <div className="flex flex-col gap-1 mt-1">
                        {address && (
                            <div className="flex items-center gap-2 text-sm" style={{ color: colors.textSecondary }}>
                                <span className="break-words">{address}</span>
                            </div>
                        )}
                        {whatsapp && (
                            <div className="flex items-center gap-2 text-sm" style={{ color: colors.textSecondary }}>

                                {whatsappLink ? (
                                    <a
                                        href={whatsappLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{
                                            ...pillButtonStyle,
                                            background: GRADIENT,
                                            color: '#ffffff',
                                            boxShadow: `0 4px 12px #f9731640`,
                                        }}
                                        className="hover:scale-105 transition-transform"
                                    >
                                        <Phone size={14} />
                                        {whatsapp}
                                    </a>
                                ) : (
                                    <span>{whatsapp}</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}