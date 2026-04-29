// src/components/ui/Button.tsx
'use client'

import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
    size?: 'sm' | 'md' | 'lg'
    loading?: boolean
    fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', size = 'md', loading, fullWidth, children, disabled, ...props }, ref) => {
        const baseStyles = 'inline-flex items-center justify-center font-black uppercase tracking-wider transition-all duration-300 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed'

        const variants = {
            primary: 'bg-black text-white hover:bg-gray-800 active:scale-[0.98] shadow-lg',
            secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:scale-[0.98]',
            outline: 'border-2 border-gray-200 bg-white text-gray-900 hover:bg-gray-50 hover:border-gray-300',
            ghost: 'text-gray-600 hover:text-black hover:bg-gray-100'
        }

        const sizes = {
            sm: 'px-4 py-2 text-[10px]',
            md: 'px-6 py-3 text-xs',
            lg: 'px-8 py-4 text-sm'
        }

        return (
            <button
                ref={ref}
                className={cn(
                    baseStyles,
                    variants[variant],
                    sizes[size],
                    fullWidth && 'w-full',
                    className
                )}
                disabled={disabled || loading}
                {...props}
            >
                {loading ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                    children
                )}
            </button>
        )
    }
)

Button.displayName = 'Button'