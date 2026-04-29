// src/components/ui/Logo.tsx
'use client'

import { cn } from '@/lib/utils'

interface LogoProps {
    size?: 'sm' | 'md' | 'lg'
    showText?: boolean
    className?: string
}

export const Logo = ({ size = 'md', showText = false, className }: LogoProps) => {
    const sizes = {
        sm: 'w-10 h-10',
        md: 'w-16 h-16',
        lg: 'w-20 h-20'
    }

    const textSizes = {
        sm: 'text-lg',
        md: 'text-2xl',
        lg: 'text-3xl'
    }

    return (
        <div className={cn("flex items-center justify-center gap-3", className)}>
            <div className="relative">
                <div className="absolute inset-0 bg-black/5 rounded-full blur-xl animate-pulse" />
                <div className={cn(
                    "relative bg-white rounded-full shadow-[0_20px_35px_-10px_rgba(0,0,0,0.3)] flex items-center justify-center border border-gray-200",
                    sizes[size]
                )}>
                    <img
                        src="/logo.png"
                        alt="iUser Logo"
                        className={cn("object-contain", {
                            'w-6 h-6': size === 'sm',
                            'w-10 h-10': size === 'md',
                            'w-12 h-12': size === 'lg'
                        })}
                    />
                </div>
            </div>
            {showText && (
                <span className={cn("font-black tracking-tighter", textSizes[size])}>
                    iUser
                </span>
            )}
        </div>
    )
}