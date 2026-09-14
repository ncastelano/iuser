// src/components/FallbackImage.tsx
//
// Imagem com fallback em cadeia: tenta cada URL da lista em ordem (ex.: foto
// do produto, depois foto da loja) e, se uma falhar ao carregar (não só se
// estiver ausente - carrinhos antigos podem ter guardado um caminho de
// storage não resolvido, que existe mas não abre como imagem), passa pra
// próxima. Se nenhuma carregar, mostra a inicial do nome num círculo colorido
// em vez de um ícone genérico - assim a foto de "algo" sempre aparece.
'use client'

import { useState } from 'react'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

interface FallbackImageProps {
    srcs: (string | null | undefined)[]
    alt: string
    name: string
    className: string
    initialClassName?: string
}

export default function FallbackImage({ srcs, alt, name, className, initialClassName = 'text-lg' }: FallbackImageProps) {
    const candidates = srcs.filter((s): s is string => Boolean(s))
    const [idx, setIdx] = useState(0)

    if (idx < candidates.length) {
        return (
            <img
                src={candidates[idx]}
                alt={alt}
                className={className}
                onError={() => setIdx((i) => i + 1)}
            />
        )
    }

    const initial = name?.trim() ? name.trim().charAt(0).toUpperCase() : '?'
    return (
        <div
            className={`w-full h-full flex items-center justify-center font-black ${initialClassName}`}
            style={{ background: GRADIENT, color: '#ffffff' }}
        >
            {initial}
        </div>
    )
}
