// src/components/Spinner.tsx
'use client'

interface SpinnerProps {
    size?: number
    color?: string
    className?: string
}

// ===== Spinner padrão do app: anel girando com dois traços (topo/base) =====
// Mesmo desenho usado no carregamento de página do Store.tsx. Sem `color`,
// herda a cor de texto do elemento pai (currentColor) - mesmo comportamento
// que os ícones Loader2 que ele substitui tinham por padrão.
export function Spinner({ size = 32, color, className = '' }: SpinnerProps) {
    return (
        <div
            className={`animate-spin rounded-full border-t-2 border-b-2 ${className}`}
            style={{ width: size, height: size, borderColor: color || 'currentColor' }}
        />
    )
}
