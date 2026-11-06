// src/modules/chat/ui/NewConversationSheet.tsx
//
// "Nova conversa": a pessoa escolhe quem chamar. Uma pessoa = a conversa normal dela com ela; duas ou mais = grupo
// (pede um nome e manda convites). Seguidos primeiro; a busca alcança qualquer perfil do iUser.
'use client'

import { useState } from 'react'
import { ArrowLeft, Users, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import PeoplePicker, { PersonAvatar } from './PeoplePicker'
import { createGroup, startDirect, GROUP_MAX_MEMBERS, type PersonHit } from '../api'

const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

export default function NewConversationSheet({ me, onClose, onOpenConversation }: {
    me: string
    onClose: () => void
    /** Abre a conversa criada (ou já existente) */
    onOpenConversation: (conversationId: string, created: 'direct' | 'group') => void
}) {
    const { colors } = useTheme()
    const [selected, setSelected] = useState<PersonHit[]>([])
    const [step, setStep] = useState<'pick' | 'name'>('pick')
    const [title, setTitle] = useState('')
    const [busy, setBusy] = useState(false)

    const toggle = (p: PersonHit) => {
        setSelected((cur) => {
            if (cur.some((c) => c.id === p.id)) return cur.filter((c) => c.id !== p.id)
            if (cur.length >= GROUP_MAX_MEMBERS - 1) { toast.error(`Um grupo tem no máximo ${GROUP_MAX_MEMBERS} pessoas`); return cur }
            return [...cur, p]
        })
    }

    const goDirect = async () => {
        if (selected.length !== 1 || busy) return
        setBusy(true)
        try {
            const id = await startDirect(selected[0].id)
            onOpenConversation(id, 'direct')
        } catch (err: any) {
            toast.error(err.message || 'Não foi possível abrir a conversa')
        } finally {
            setBusy(false)
        }
    }

    const makeGroup = async () => {
        if (selected.length < 2 || !title.trim() || busy) return
        setBusy(true)
        try {
            const id = await createGroup(title.trim(), selected.map((s) => s.id))
            toast.success('Grupo criado. Os convites foram enviados.')
            onOpenConversation(id, 'group')
        } catch (err: any) {
            toast.error(err.message || 'Não foi possível criar o grupo')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center" role="dialog" aria-modal="true" aria-label="Nova conversa">
            <button aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/45" />
            <div
                className="relative w-full md:max-w-md flex flex-col rounded-t-[28px] md:rounded-[28px] px-4 pt-4 pb-5"
                style={{ background: colors.background, height: 'min(82dvh, 640px)', boxShadow: '0 -12px 40px rgba(0,0,0,0.25)' }}
            >
                <div className="flex items-center gap-2 flex-shrink-0">
                    {step === 'name' ? (
                        <button onClick={() => setStep('pick')} aria-label="Voltar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                            <ArrowLeft size={18} />
                        </button>
                    ) : (
                        <span className="w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: GRADIENT }}><Users size={18} /></span>
                    )}
                    <h2 className="flex-1 text-lg font-black" style={{ color: colors.textPrimary }}>
                        {step === 'name' ? 'Novo grupo' : 'Nova conversa'}
                    </h2>
                    <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                        <X size={18} />
                    </button>
                </div>

                {selected.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto py-3 flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
                        {selected.map((p) => (
                            <button key={p.id} onClick={() => toggle(p)} className="flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full flex-shrink-0" style={{ background: `${colors.accent}1a`, color: colors.textPrimary }}>
                                <PersonAvatar p={p} size={24} />
                                <span className="text-xs font-bold">{p.slug ? `@${p.slug}` : p.name}</span>
                                <X size={12} style={{ color: colors.textSecondary }} />
                            </button>
                        ))}
                    </div>
                )}

                {step === 'pick' ? (
                    <div className="flex-1 min-h-0 flex flex-col mt-1">
                        <PeoplePicker me={me} selected={selected} onToggle={toggle} />
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 mt-3">
                        <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Como o grupo vai se chamar?</p>
                        <input
                            autoFocus
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            maxLength={60}
                            placeholder="Ex.: Time da loja, Amigos do bairro..."
                            className="w-full mt-2 px-4 py-3 rounded-2xl text-sm focus:outline-none"
                            style={{ background: `${colors.border}40`, color: colors.textPrimary }}
                        />
                        <p className="text-xs mt-3" style={{ color: colors.textSecondary }}>
                            {selected.length} {selected.length === 1 ? 'pessoa será convidada' : 'pessoas serão convidadas'}. Cada uma decide se entra.
                        </p>
                    </div>
                )}

                <div className="flex-shrink-0 pt-3">
                    {step === 'pick' ? (
                        <button
                            disabled={selected.length === 0 || busy}
                            onClick={selected.length === 1 ? goDirect : () => setStep('name')}
                            className="w-full h-12 rounded-full text-sm font-black text-white disabled:opacity-40 flex items-center justify-center gap-2 transition active:scale-[0.98]"
                            style={{ background: GRADIENT }}
                        >
                            {busy ? <Spinner size={18} color="#fff" /> : selected.length === 0
                                ? 'Escolha quem você quer chamar'
                                : selected.length === 1
                                    ? `Conversar com ${selected[0].slug ? '@' + selected[0].slug : selected[0].name}`
                                    : `Criar grupo com ${selected.length} pessoas`}
                        </button>
                    ) : (
                        <button
                            disabled={!title.trim() || busy}
                            onClick={makeGroup}
                            className="w-full h-12 rounded-full text-sm font-black text-white disabled:opacity-40 flex items-center justify-center gap-2 transition active:scale-[0.98]"
                            style={{ background: GRADIENT }}
                        >
                            {busy ? <Spinner size={18} color="#fff" /> : 'Criar grupo e convidar'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
