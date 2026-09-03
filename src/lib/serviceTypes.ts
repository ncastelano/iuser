// src/lib/serviceTypes.ts
import { PaintRoller, Wrench, Leaf, Zap, Sparkles, Hammer, Briefcase, LucideIcon } from 'lucide-react'

export type ServiceType = 'pintor' | 'encanador' | 'jardineiro' | 'eletricista' | 'diarista' | 'montador' | 'outro'

export const SERVICE_TYPES: { id: ServiceType; label: string; icon: LucideIcon }[] = [
    { id: 'pintor', label: 'Pintor', icon: PaintRoller },
    { id: 'encanador', label: 'Encanador', icon: Wrench },
    { id: 'jardineiro', label: 'Jardineiro', icon: Leaf },
    { id: 'eletricista', label: 'Eletricista', icon: Zap },
    { id: 'diarista', label: 'Diarista', icon: Sparkles },
    { id: 'montador', label: 'Montador de móveis', icon: Hammer },
    { id: 'outro', label: 'Outro', icon: Briefcase },
]

export function getServiceIcon(type: string): LucideIcon {
    return SERVICE_TYPES.find((t) => t.id === type)?.icon || Briefcase
}

export function getServiceLabel(type: string, customService?: string | null): string {
    if (type === 'outro') return customService || 'Outro'
    return SERVICE_TYPES.find((t) => t.id === type)?.label || type
}
