'use client'

import { Star } from 'lucide-react'

type RatingStarsProps = {
    value: number
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

    return (
        <div className={`flex items-center gap-1 ${className}`}>
            {Array.from({ length: 5 }).map((_, index) => {
                const starValue = index + 1
                const filled = starValue <= Math.round(value)

                return (
                    <button
                        key={starValue}
                        type="button"
                        disabled={!isInteractive}
                        onClick={() => onChange?.(starValue)}
                        className={isInteractive ? 'transition-transform hover:scale-110 active:scale-95' : 'cursor-default'}
                        aria-label={`${starValue} estrelas`}
                    >
                        <Star
                            style={{ width: size, height: size }}
                            className={filled ? 'fill-yellow-400 text-yellow-400' : 'text-neutral-600'}
                        />
                    </button>
                )
            })}
        </div>
    )
}
