// src/components/LogoHomeButton.tsx
'use client'

import { useRouter } from 'next/navigation'
import Image from 'next/image'

interface LogoHomeButtonProps {
    className?: string
    size?: number
}

export function LogoHomeButton({
    className = '',
    size = 24,
}: LogoHomeButtonProps) {
    const router = useRouter()

    const handleClick = () => {
        router.push('/')
    }

    return (
        <button
            onClick={handleClick}
            className={`flex items-center justify-center rounded-full p-1 transition-transform duration-200 hover:scale-110 active:scale-95 ${className}`}
            style={{
                background: 'linear-gradient(135deg, #f97316, #dc2626)',
                boxShadow: '0 4px 14px rgba(249, 115, 22, 0.4)',
            }}
            aria-label="Ir para o início"
        >
            <div
                className="relative flex items-center justify-center"
                style={{
                    width: size,
                    height: size,
                }}
            >
                <Image
                    src="/logotransparente.png"
                    alt="iUser"
                    width={size}
                    height={size}
                    className="object-contain"
                    priority
                    style={{
                        transform: 'translateY(-1px)',
                    }}
                />
            </div>
        </button>
    )
}