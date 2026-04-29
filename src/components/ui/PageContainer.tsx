// src/components/ui/PageContainer.tsx
'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageContainerProps {
    children: ReactNode
    className?: string
    showPattern?: boolean
    showBlurCircles?: boolean
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
}

export const PageContainer = ({
    children,
    className,
    showPattern = true,
    showBlurCircles = true,
    maxWidth = 'full'
}: PageContainerProps) => {
    const maxWidthClasses = {
        sm: 'max-w-screen-sm',
        md: 'max-w-screen-md',
        lg: 'max-w-screen-lg',
        xl: 'max-w-screen-xl',
        full: 'max-w-full'
    }

    return (
        <div className={cn(
            "relative min-h-screen bg-gradient-to-br from-gray-50 to-white overflow-hidden",
            className
        )}>
            {/* Background Elements */}
            <div className="fixed inset-0 pointer-events-none z-0">
                {showBlurCircles && (
                    <>
                        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-black/5 rounded-full blur-3xl animate-pulse" />
                        <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] bg-gray-900/5 rounded-full blur-3xl" />
                        <div className="absolute top-[30%] left-[20%] w-[300px] h-[300px] bg-gray-800/5 rounded-full blur-3xl" />
                    </>
                )}
                {showPattern && (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,0.03)_1px,_transparent_1px)] bg-[size:24px_24px]" />
                )}
            </div>

            {/* Content */}
            <div className={cn("relative z-10 mx-auto px-4", maxWidthClasses[maxWidth])}>
                {children}
            </div>
        </div>
    )
}