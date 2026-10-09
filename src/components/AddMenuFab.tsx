// Botão flutuante "Adicionar" do painel do perfil (irmão do botão de voltar pra home): abre um menu com
// Publicação e Serviço; escolher um faz o "bot" levar a pessoa até o componente certo, que abre já com o formulário.
'use client'

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Plus, Wrench } from 'lucide-react'
import { launchAddBot, type AddKind } from '@/lib/addBot'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function AddMenuFab() {
    const [open, setOpen] = useState(false)
    const btnRef = useRef<HTMLButtonElement>(null)
    const rootRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false) }
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
    }, [open])

    const choose = (kind: AddKind) => {
        setOpen(false)
        launchAddBot(kind, btnRef.current)
    }

    const options: { kind: AddKind; label: string; hint: string; icon: typeof Plus }[] = [
        { kind: 'publication', label: 'Publicação', hint: 'Imagem e texto no seu perfil', icon: ImagePlus },
        { kind: 'service', label: 'Serviço', hint: 'Anuncie o que você faz', icon: Wrench },
    ]

    return (
        <div ref={rootRef} className="relative flex-shrink-0">
            {open && (
                <div
                    className="absolute bottom-full left-0 mb-3 w-64 rounded-3xl p-2 flex flex-col gap-1"
                    style={{ background: '#ffffff', border: '1px solid #f9731640', boxShadow: '0 12px 36px rgba(0,0,0,0.25)', animation: 'addMenuIn .18s ease-out' }}
                >
                    {options.map((o) => {
                        const Icon = o.icon
                        return (
                            <button
                                key={o.kind}
                                onClick={() => choose(o.kind)}
                                className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors hover:bg-orange-50"
                            >
                                <span className="w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: GRADIENT }}><Icon size={18} /></span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-black text-gray-900">{o.label}</span>
                                    <span className="block text-[11px] text-gray-500">{o.hint}</span>
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}
            <button
                ref={btnRef}
                onClick={() => setOpen((v) => !v)}
                className="h-14 px-5 rounded-full flex items-center gap-2 font-black text-sm shadow-2xl transition-transform duration-200 hover:scale-105 active:scale-95"
                style={{ background: GRADIENT, color: '#ffffff', border: '2px solid #f97316', boxShadow: '0 8px 24px #f9731660' }}
                aria-haspopup="menu"
                aria-expanded={open}
            >
                <Plus size={22} style={{ transition: 'transform .2s', transform: open ? 'rotate(45deg)' : 'none' }} />
                Adicionar
            </button>
            <style>{`@keyframes addMenuIn { from { opacity: 0; transform: translateY(8px) scale(.97) } to { opacity: 1; transform: none } }`}</style>
        </div>
    )
}
