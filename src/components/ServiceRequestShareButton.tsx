// src/components/ServiceRequestShareButton.tsx
//
// Botão "Compartilhar" dos pedidos de serviço (home, Procurar serviço e a janela do pedido): abre o diálogo padrão do iUser
// (copiar link, redes sociais, comunidade, perfil) com o link do pedido.
'use client'

import { Share2 } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { handleShareLink } from '@/lib/share'
import { serviceRequestShare, type BoardItem } from '@/lib/serviceBoard'

export default function ServiceRequestShareButton({ item, size = 32, label, className = '' }: { item: Pick<BoardItem, 'id' | 'service_type' | 'custom_service' | 'description' | 'photo_urls'>; size?: number; label?: string; className?: string }) {
    const { colors } = useTheme()
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void handleShareLink(serviceRequestShare(item)) }}
            aria-label="Compartilhar pedido"
            title="Compartilhar"
            className={`flex-shrink-0 inline-flex items-center justify-center gap-1.5 rounded-full font-black text-[12px] transition active:scale-95 ${className}`}
            style={{ height: size, minWidth: size, padding: label ? '0 14px' : 0, background: `${colors.border}40`, color: colors.textPrimary }}
        >
            <Share2 size={Math.round(size * 0.45)} style={{ color: '#f97316' }} />
            {label}
        </button>
    )
}
