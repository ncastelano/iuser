// components/DeleteConfirmDialog.tsx
'use client'

import { useState } from 'react'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { AlertTriangle, X } from 'lucide-react'

interface DeleteConfirmDialogProps {
    title: string
    description: string
    confirmLabel: string
    onConfirm: (password: string) => Promise<void>
    onClose: () => void
}

// Confirmação de ação destrutiva: só libera com a senha da conta. Quem
// chama recebe a senha e faz a chamada (o servidor confere de verdade).
export default function DeleteConfirmDialog({ title, description, confirmLabel, onConfirm, onClose }: DeleteConfirmDialogProps) {
    const { colors } = useTheme()
    const [password, setPassword] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const submit = async () => {
        if (!password || busy) return
        setBusy(true)
        setError(null)
        try {
            await onConfirm(password)
        } catch (err: any) {
            setError(err.message || 'Erro ao excluir')
            setBusy(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={busy ? undefined : onClose}>
            <div className="w-full max-w-sm rounded-2xl p-6 relative" style={{ background: colors.surface, border: `1px solid ${colors.border}` }} onClick={(e) => e.stopPropagation()}>
                {!busy && (
                    <button onClick={onClose} className="absolute top-4 right-4" style={{ color: colors.textSecondary }}>
                        <X size={20} />
                    </button>
                )}
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#ef444420', color: '#ef4444' }}>
                        <AlertTriangle size={24} />
                    </div>
                    <h2 className="text-lg font-black" style={{ color: colors.textPrimary }}>{title}</h2>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>{description}</p>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
                        placeholder="Digite sua senha"
                        autoComplete="current-password"
                        className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none"
                        style={{ background: colors.background, borderColor: colors.border, color: colors.textPrimary }}
                    />
                    {error && <p className="text-xs font-bold" style={{ color: '#ef4444' }}>{error}</p>}
                    <div className="flex gap-2 w-full">
                        <button
                            onClick={onClose}
                            disabled={busy}
                            className="flex-1 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50"
                            style={{ background: `${colors.border}30`, color: colors.textSecondary }}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={submit}
                            disabled={busy || !password}
                            className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50"
                            style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}
                        >
                            {busy ? <Spinner size={14} color="#ffffff" /> : confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
