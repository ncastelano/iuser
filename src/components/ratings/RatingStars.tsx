'use client'

import { Star, StarHalf } from 'lucide-react'

type RatingStarsProps = {
    value: number | string
    onChange?: (value: number) => void
    size?: number
    disabled?: boolean
    className?: string
}

export function RatingStars({
    value,
    onChange,
    size = 18,
    disabled = false,
    className = '',
}: RatingStarsProps) {
    const isInteractive = !!onChange && !disabled
    const numericValue = typeof value === 'string' ? parseFloat(value) : (value || 0)

    return (
        <div className={`flex items-center gap-0.5 ${className}`}>
            {Array.from({ length: 5 }).map((_, index) => {
                const starValue = index + 1

                const isFull = starValue <= Math.floor(numericValue)
                const isHalf = !isFull && (starValue - 0.5) <= numericValue

                const content = (
                    <div className="relative" style={{ width: size, height: size }}>
                        {/* Estrela de Fundo (Vazia) */}
                        <Star
                            style={{ width: size, height: size }}
                            className="text-neutral-300 absolute inset-0"
                            strokeWidth={1.5}
                        />

                        {/* Estrela Parcial (Meia) */}
                        {isHalf && !isFull && (
                            <StarHalf
                                style={{ width: size, height: size }}
                                className="fill-yellow-400 text-yellow-400 absolute inset-0 animate-in fade-in zoom-in-50 duration-300"
                                strokeWidth={1.5}
                            />
                        )}

                        {/* Estrela Cheia */}
                        {isFull && (
                            <Star
                                style={{ width: size, height: size }}
                                className="fill-yellow-400 text-yellow-400 absolute inset-0 animate-in fade-in zoom-in-50 duration-300"
                                strokeWidth={1.5}
                            />
                        )}
                    </div>
                )

                if (isInteractive) {
                    return (
                        <button
                            key={starValue}
                            type="button"
                            onClick={() => onChange?.(starValue)}
                            className="transition-transform hover:scale-110 active:scale-95"
                            aria-label={`${starValue} estrelas`}
                        >
                            {content}
                        </button>
                    )
                }

                return (
                    <span
                        key={starValue}
                        className="inline-flex cursor-default"
                        aria-label={`${starValue} estrelas`}
                    >
                        {content}
                    </span>
                )
            })}
        </div>
    )
}