// Estrelas (só leitura ou para escolher), em tamanho pequeno, que funcionam nos fundos escuros e claros das agendas.
'use client'

import { Star } from 'lucide-react'

export default function Stars({ value, onChange, size = 16 }: { value: number; onChange?: (v: number) => void; size?: number }) {
    return (
        <span style={{ display: 'inline-flex', gap: 2 }} aria-label={`${value} de 5 estrelas`}>
            {[1, 2, 3, 4, 5].map((n) => {
                const on = n <= Math.round(value)
                const star = <Star size={size} style={{ color: '#facc15', fill: on ? '#facc15' : 'transparent', opacity: on ? 1 : 0.45 }} />
                return onChange
                    ? <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} estrela${n > 1 ? 's' : ''}`} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', lineHeight: 0 }}>{star}</button>
                    : <span key={n} style={{ lineHeight: 0 }}>{star}</span>
            })}
        </span>
    )
}
