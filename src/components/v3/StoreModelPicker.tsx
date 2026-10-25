// src/components/v3/StoreModelPicker.tsx
//
// Escolha do MODELO da loja (produtos, atendimento ou mista): três cartões com uma miniatura de como a página fica e de qual é o botão
// central. Só apresentação: quem usa guarda o valor (na criação da loja) ou salva (painel da loja).
'use client'

import { Check } from 'lucide-react'
import { STORE_MODELS, type StoreModel } from '@/lib/storeModel'

const ORANGE = '#f97316'

// miniatura da página: linhas cinzas (conteúdo) e o(s) botão(ões) laranja(s) que cada modelo destaca
function Mini({ model, colors }: { model: StoreModel; colors: any }) {
    const bar = `${colors.border}90`
    return (
        <div className="w-[74px] h-[92px] rounded-xl p-2 flex flex-col gap-1.5 flex-shrink-0" style={{ background: `${colors.border}30` }} aria-hidden>
            <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-md" style={{ background: bar }} />
                <span className="h-1.5 flex-1 rounded-full" style={{ background: bar }} />
            </div>
            {model === 'products' && (<>
                <div className="grid grid-cols-2 gap-1 flex-1">{[0, 1, 2, 3].map((i) => <span key={i} className="rounded-md" style={{ background: bar }} />)}</div>
                <span className="h-3.5 rounded-full" style={{ background: ORANGE }} />
            </>)}
            {model === 'services' && (<>
                <div className="flex flex-col gap-1 flex-1">{[0, 1, 2].map((i) => <span key={i} className="flex-1 rounded-md" style={{ background: bar }} />)}</div>
                <span className="h-3.5 rounded-full" style={{ background: ORANGE }} />
            </>)}
            {model === 'mixed' && (<>
                <div className="grid grid-cols-2 gap-1 flex-1">{[0, 1, 2, 3].map((i) => <span key={i} className="rounded-md" style={{ background: bar }} />)}</div>
                <div className="flex gap-1">
                    <span className="h-3.5 flex-1 rounded-full" style={{ background: ORANGE }} />
                    <span className="h-3.5 flex-1 rounded-full" style={{ border: `1.5px solid ${ORANGE}` }} />
                </div>
            </>)}
        </div>
    )
}

export default function StoreModelPicker({ value, onChange, colors }: { value: StoreModel; onChange: (m: StoreModel) => void; colors: any }) {
    return (
        <div className="space-y-2" role="radiogroup" aria-label="Modelo da loja">
            {STORE_MODELS.map((m) => {
                const on = value === m.id
                return (
                    <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onChange(m.id)}
                        className="w-full flex items-center gap-3 p-3 rounded-3xl text-left transition active:scale-[0.99]"
                        style={{ background: on ? `${ORANGE}12` : `${colors.border}25`, boxShadow: on ? `inset 0 0 0 2px ${ORANGE}` : undefined }}
                    >
                        <Mini model={m.id} colors={colors} />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[14px] font-black" style={{ color: colors.textPrimary }}>{m.title}</span>
                            <span className="block text-[12px] leading-snug" style={{ color: colors.textSecondary }}>{m.desc}</span>
                            <span className="block text-[12px] font-black mt-1" style={{ color: ORANGE }}>{m.main}</span>
                        </span>
                        <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={on ? { background: ORANGE, color: '#fff' } : { boxShadow: `inset 0 0 0 2px ${colors.border}` }}>
                            {on && <Check size={14} strokeWidth={3} />}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
