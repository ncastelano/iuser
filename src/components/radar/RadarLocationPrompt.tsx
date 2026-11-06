// src/components/radar/RadarLocationPrompt.tsx
//
// Pergunta ao abrir o /radar sem localização definida: achar o local da pessoa sozinho (GPS do aparelho) ou digitar o endereço.
// Quem não quer nenhum dos dois segue com o mapa começando em Porto Velho. Só apresentação: quem decide e guarda é a RadarScreen.
'use client'

import { Keyboard, LocateFixed, Loader2, MapPin } from 'lucide-react'

export default function RadarLocationPrompt({ busy, error, onUseCurrent, onType, onSkip }: {
    busy: boolean
    error: string | null
    onUseCurrent: () => void
    onType: () => void
    onSkip: () => void
}) {
    return (
        <div className="absolute inset-0 z-[60] flex items-end sm:items-center justify-center p-3 sm:p-4 pointer-events-none">
            <div
                role="dialog"
                aria-label="Onde você está?"
                className="pointer-events-auto w-full max-w-sm rounded-3xl p-4 shadow-2xl border"
                style={{ background: '#ffffff', borderColor: '#e5e7eb', color: '#111827', marginBottom: 'max(env(safe-area-inset-bottom), 56px)' }}
            >
                <div className="flex items-center gap-2.5 mb-1">
                    <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: '#f9731622', color: '#f97316' }}><MapPin size={20} /></span>
                    <div className="min-w-0">
                        <p className="text-base font-black leading-tight">Onde você está?</p>
                        <p className="text-xs leading-snug" style={{ color: '#6b7280' }}>Para mostrar o que tem perto de você, o radar precisa saber o seu local.</p>
                    </div>
                </div>

                <div className="flex flex-col gap-2 mt-3">
                    <button
                        onClick={onUseCurrent}
                        disabled={busy}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left text-white transition active:scale-[0.99] disabled:opacity-70"
                        style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}
                    >
                        {busy ? <Loader2 size={20} className="animate-spin flex-shrink-0" /> : <LocateFixed size={20} className="flex-shrink-0" />}
                        <span className="min-w-0">
                            <span className="block text-sm font-black">{busy ? 'Procurando onde você está...' : 'Achar meu local automaticamente'}</span>
                            <span className="block text-[11px] opacity-90">Usa o GPS do aparelho, só nesta visita.</span>
                        </span>
                    </button>

                    <button
                        onClick={onType}
                        disabled={busy}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left border-2 transition active:scale-[0.99] disabled:opacity-60"
                        style={{ borderColor: '#e5e7eb', background: '#ffffff' }}
                    >
                        <Keyboard size={20} className="flex-shrink-0" style={{ color: '#f97316' }} />
                        <span className="min-w-0">
                            <span className="block text-sm font-black">Digitar o endereço</span>
                            <span className="block text-[11px]" style={{ color: '#6b7280' }}>Fica guardado para você não precisar repetir.</span>
                        </span>
                    </button>
                </div>

                {error && <p className="mt-2 text-xs font-semibold" style={{ color: '#dc2626' }}>{error}</p>}

                <button onClick={onSkip} disabled={busy} className="mt-2.5 w-full py-2 text-xs font-bold disabled:opacity-50" style={{ color: '#6b7280' }}>
                    Agora não — começar por Porto Velho
                </button>
            </div>
        </div>
    )
}
