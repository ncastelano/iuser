'use client'

// O que o carro TEM e o que NÃO tem, lado a lado, para o passageiro comparar antes de escolher (ar-condicionado, Wi-Fi, carregador, som,
// aceita pet — `lib/driverServices`), mais lugares e cadeirinha. O passageiro não pede mais "quero ar condicionado": ele VÊ e escolhe.
// Usado no cartão do candidato (RideTrackingPanel) e na fileira "Carros por perto" do /pedir-motorista.
import { Baby, Users } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { DRIVER_SERVICE_OPTIONS } from '@/lib/driverServices'

const ON = '#16a34a'
/** nomes curtos no modo compacto (o que o carro NÃO tem aparece só como ícone apagado e riscado) */
const SHORT: Record<string, string> = { ar_condicionado: 'Ar', wifi: 'Wi-Fi', carregador: 'USB', som: 'Som', pet_friendly: 'Pet' }

export default function CarAmenities({ services, seats, babySeat, compact = false }: { services: string[]; seats?: number | null; babySeat?: boolean | null; compact?: boolean }) {
    const { colors } = useTheme()
    const has = new Set(services)
    const size = compact ? 11 : 12
    return (
        <div className={`flex flex-wrap items-center ${compact ? 'gap-1' : 'gap-1.5'}`}>
            {DRIVER_SERVICE_OPTIONS.map((o) => {
                const on = has.has(o.id)
                const Icon = o.icon
                return (
                    <span key={o.id} title={on ? o.label : `Sem ${o.label.toLowerCase()}`} aria-label={on ? o.label : `Sem ${o.label.toLowerCase()}`}
                        className={`inline-flex items-center gap-1 rounded-full ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'} font-bold`}
                        style={on ? { background: `${ON}1a`, color: ON } : { background: `${colors.border}30`, color: colors.textSecondary, opacity: 0.5, textDecoration: 'line-through', backgroundImage: compact ? `linear-gradient(to top right, transparent calc(50% - 0.75px), ${colors.textSecondary} calc(50% - 0.75px), ${colors.textSecondary} calc(50% + 0.75px), transparent calc(50% + 0.75px))` : undefined }}>
                        <Icon size={size} />{compact ? (on ? SHORT[o.id] ?? o.label : null) : o.label}
                    </span>
                )
            })}
            {seats != null && seats > 0 && (
                <span className={`inline-flex items-center gap-1 rounded-full ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'} font-bold`} style={{ background: `${colors.border}30`, color: colors.textPrimary }}>
                    <Users size={size} />{seats} {seats === 1 ? 'lugar' : 'lugares'}
                </span>
            )}
            {babySeat && (
                <span className={`inline-flex items-center gap-1 rounded-full ${compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]'} font-bold`} style={{ background: `${ON}1a`, color: ON }}>
                    <Baby size={size} />Cadeirinha
                </span>
            )}
        </div>
    )
}
