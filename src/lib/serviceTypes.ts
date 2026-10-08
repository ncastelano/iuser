// src/lib/serviceTypes.ts
import {
    PaintRoller, Wrench, Leaf, Zap, Sparkles, Hammer, Briefcase, Brain, PawPrint, Smile, Scissors, HandHeart, GraduationCap, Dumbbell,
    Camera, Car, Truck, Utensils, Cake, Music, Palette, Laptop, Smartphone, Heart, Baby, Dog, Bike, House, Sofa, Shirt, BookOpen,
    Languages, Flower2, Bug, Wind, Droplets, KeyRound, Shield, Package, Mic, Video, Plug, Fan,
    type LucideIcon,
} from 'lucide-react'

export type ServiceType =
    | 'psicologa' | 'veterinario' | 'dentista' | 'cabeleireiro' | 'massageador' | 'instrutor' | 'personal'
    | 'pintor' | 'encanador' | 'jardineiro' | 'eletricista' | 'diarista' | 'montador' | 'outro'

export const SERVICE_TYPES: { id: ServiceType; label: string; icon: LucideIcon }[] = [
    { id: 'psicologa', label: 'Psicóloga', icon: Brain },
    { id: 'veterinario', label: 'Veterinário', icon: PawPrint },
    { id: 'dentista', label: 'Dentista', icon: Smile },
    { id: 'cabeleireiro', label: 'Cabeleireiro', icon: Scissors },
    { id: 'massageador', label: 'Massageador', icon: HandHeart },
    { id: 'instrutor', label: 'Instrutor', icon: GraduationCap },
    { id: 'personal', label: 'Personal', icon: Dumbbell },
    { id: 'pintor', label: 'Pintor', icon: PaintRoller },
    { id: 'encanador', label: 'Encanador', icon: Wrench },
    { id: 'jardineiro', label: 'Jardineiro', icon: Leaf },
    { id: 'eletricista', label: 'Eletricista', icon: Zap },
    { id: 'diarista', label: 'Diarista', icon: Sparkles },
    { id: 'montador', label: 'Montador de móveis', icon: Hammer },
    { id: 'outro', label: 'Outro', icon: Briefcase },
]

/** Ícones que a pessoa pode escolher ao criar um tipo "Outro" (guardamos só a chave em service_requests.custom_icon) */
export const SERVICE_ICON_OPTIONS: { key: string; label: string; icon: LucideIcon }[] = [
    { key: 'briefcase', label: 'Trabalho', icon: Briefcase },
    { key: 'camera', label: 'Foto', icon: Camera },
    { key: 'video', label: 'Vídeo', icon: Video },
    { key: 'music', label: 'Música', icon: Music },
    { key: 'mic', label: 'Som', icon: Mic },
    { key: 'palette', label: 'Arte', icon: Palette },
    { key: 'laptop', label: 'Computador', icon: Laptop },
    { key: 'smartphone', label: 'Celular', icon: Smartphone },
    { key: 'plug', label: 'Instalação', icon: Plug },
    { key: 'fan', label: 'Ar-condicionado', icon: Fan },
    { key: 'wind', label: 'Ventilação', icon: Wind },
    { key: 'droplets', label: 'Água', icon: Droplets },
    { key: 'key', label: 'Chaveiro', icon: KeyRound },
    { key: 'shield', label: 'Segurança', icon: Shield },
    { key: 'house', label: 'Casa', icon: House },
    { key: 'sofa', label: 'Móveis', icon: Sofa },
    { key: 'hammer', label: 'Reforma', icon: Hammer },
    { key: 'wrench', label: 'Conserto', icon: Wrench },
    { key: 'bug', label: 'Dedetização', icon: Bug },
    { key: 'flower', label: 'Plantas', icon: Flower2 },
    { key: 'truck', label: 'Frete', icon: Truck },
    { key: 'package', label: 'Entrega', icon: Package },
    { key: 'car', label: 'Carro', icon: Car },
    { key: 'bike', label: 'Bicicleta', icon: Bike },
    { key: 'utensils', label: 'Comida', icon: Utensils },
    { key: 'cake', label: 'Festa', icon: Cake },
    { key: 'shirt', label: 'Roupas', icon: Shirt },
    { key: 'scissors', label: 'Beleza', icon: Scissors },
    { key: 'baby', label: 'Crianças', icon: Baby },
    { key: 'dog', label: 'Pets', icon: Dog },
    { key: 'heart', label: 'Cuidados', icon: Heart },
    { key: 'book', label: 'Aulas', icon: BookOpen },
    { key: 'languages', label: 'Idiomas', icon: Languages },
]

export function getServiceIcon(type: string, customIcon?: string | null): LucideIcon {
    if (type === 'outro' && customIcon) {
        const custom = SERVICE_ICON_OPTIONS.find((o) => o.key === customIcon)
        if (custom) return custom.icon
    }
    return SERVICE_TYPES.find((t) => t.id === type)?.icon || Briefcase
}

export function getServiceLabel(type: string, customService?: string | null): string {
    if (type === 'outro') return customService || 'Outro'
    return SERVICE_TYPES.find((t) => t.id === type)?.label || type
}

/** Título de um pedido: o que a PESSOA escreveu (1ª linha, cortada), não o tipo. Sem descrição, cai no tipo. */
export function getRequestTitle(description: string | null | undefined, type: string, customService?: string | null, max = 80): string {
    const first = (description || '').split('\n').map((l) => l.trim()).find(Boolean) || ''
    if (!first) return getServiceLabel(type, customService)
    return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first
}
