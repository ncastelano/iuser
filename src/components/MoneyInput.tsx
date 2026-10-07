'use client'

import { InputHTMLAttributes } from 'react'

interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
    /** Valor em decimal com ponto ("1234.50"), ou '' quando vazio — mesmo formato que o resto do app já usa pra parseFloat. */
    value: string
    onChange: (value: string) => void
}

/**
 * Campo de dinheiro no padrão brasileiro: o usuário só digita os números e o
 * campo vai formatando (1 → 0,01 · 100000 → 1.000,00 · 10000000 → 100.000,00).
 */
export default function MoneyInput({ value, onChange, placeholder = '0,00', ...rest }: MoneyInputProps) {
    const num = value ? parseFloat(value) : NaN
    const display = Number.isFinite(num) && num > 0
        ? num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : ''

    return (
        <input
            {...rest}
            type="text"
            inputMode="numeric"
            value={display}
            placeholder={placeholder}
            onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 12)
                const cents = digits ? parseInt(digits, 10) : 0
                onChange(cents === 0 ? '' : (cents / 100).toFixed(2))
            }}
        />
    )
}
