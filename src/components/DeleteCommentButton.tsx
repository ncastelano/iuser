// Lixeira do próprio comentário com a confirmação ali mesmo ("Excluir" / "Cancelar"), sem o confirm() do navegador
// (que some em alguns aparelhos e navegadores embutidos, deixando o comentário impossível de apagar).
'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'

export default function DeleteCommentButton({ onConfirm, colors }: { onConfirm: () => void; colors: any }) {
    const [asking, setAsking] = useState(false)

    if (asking) {
        return (
            <div className="flex items-center gap-1.5">
                <button
                    onClick={() => { setAsking(false); onConfirm() }}
                    className="px-3 py-1.5 rounded-full text-xs font-black text-white"
                    style={{ background: '#ef4444' }}
                >
                    Excluir
                </button>
                <button
                    onClick={() => setAsking(false)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold"
                    style={{ color: colors.textSecondary, border: `1px solid ${colors.border}` }}
                >
                    Cancelar
                </button>
            </div>
        )
    }

    return (
        <button
            onClick={() => setAsking(true)}
            aria-label="Excluir meu comentário"
            title="Excluir meu comentário"
            className="w-9 h-9 rounded-full flex items-center justify-center transition hover:scale-105"
            style={{ background: '#ef444414' }}
        >
            <Trash2 size={16} style={{ color: '#ef4444' }} />
        </button>
    )
}
