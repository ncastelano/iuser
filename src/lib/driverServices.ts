import { Snowflake, Wifi, BatteryCharging, Music, PawPrint, type LucideIcon } from 'lucide-react'

export interface DriverServiceOption {
    id: string
    label: string
    icon: LucideIcon
}

export const DRIVER_SERVICE_OPTIONS: DriverServiceOption[] = [
    { id: 'ar_condicionado', label: 'Ar-condicionado', icon: Snowflake },
    { id: 'wifi', label: 'Wi-Fi', icon: Wifi },
    { id: 'carregador', label: 'Carregador USB', icon: BatteryCharging },
    { id: 'som', label: 'Som / playlist', icon: Music },
    { id: 'pet_friendly', label: 'Aceita pet', icon: PawPrint },
]

export function driverServiceLabel(id: string): string {
    return DRIVER_SERVICE_OPTIONS.find((s) => s.id === id)?.label || id
}
