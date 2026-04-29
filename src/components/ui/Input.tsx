// src/components/ui/Input.tsx
'use client'

import { forwardRef, InputHTMLAttributes, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string
    error?: string
    icon?: React.ReactNode
    rightIcon?: React.ReactNode
    password?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, icon, rightIcon, password, type, id, ...props }, ref) => {
        const [showPassword, setShowPassword] = useState(false)
        const inputId = id || label?.toLowerCase().replace(/\s/g, '-')
        const inputType = password ? (showPassword ? 'text' : 'password') : type

        return (
            <div className="space-y-1.5">
                {label && (
                    <label
                        htmlFor={inputId}
                        className="text-[10px] font-black uppercase tracking-wider text-gray-500 flex items-center gap-2 ml-2"
                    >
                        {icon && <span className="text-gray-400">{icon}</span>}
                        {label}
                    </label>
                )}
                <div className="relative">
                    <input
                        ref={ref}
                        id={inputId}
                        type={inputType}
                        className={cn(
                            "w-full px-4 py-3 bg-white border",
                            error ? "border-red-500" : "border-gray-200",
                            "rounded-xl text-gray-900 placeholder:text-gray-400 text-sm transition-all",
                            "focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent",
                            "hover:border-gray-300",
                            className
                        )}
                        {...props}
                    />
                    {password && (
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    )}
                    {rightIcon && !password && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                            {rightIcon}
                        </div>
                    )}
                </div>
                {error && (
                    <p className="text-[10px] font-medium text-red-600 ml-2">{error}</p>
                )}
            </div>
        )
    }
)

Input.displayName = 'Input'