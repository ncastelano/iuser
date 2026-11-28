// Peças visuais das ações de mensagem: a folha de ações (toque longo), a citação de resposta, as reações e o visto.
// As regras (quem pode o quê, janelas, contagens) moram em src/modules/chat/messageActions.ts.
'use client'

import { useState } from 'react'
import { Check, CheckCheck, CornerUpLeft, Copy, EyeOff, Pencil, Trash2 } from 'lucide-react'
import { REACTION_EMOJIS, type ReactionChip, type Tick } from '@/modules/chat/messageActions'

type Colors = { textPrimary: string; textSecondary: string; border: string; surface: string; background: string; accent: string }

/** Folha de ações da mensagem (aberta com toque longo ou clique com o botão direito). */
export function MessageMenu({ open, onClose, canEdit, canDeleteAll, canCopy, myReaction, onReact, onReply, onCopy, onEdit, onDeleteMe, onDeleteAll, colors }: {
    open: boolean
    onClose: () => void
    canEdit: boolean
    canDeleteAll: boolean
    canCopy: boolean
    myReaction: string | null
    onReact: (emoji: string) => void
    onReply: () => void
    onCopy: () => void
    onEdit: () => void
    onDeleteMe: () => void
    onDeleteAll: () => void
    colors: Colors
}) {
    // apagar para todos pede uma confirmação em dois toques (não se apaga sem querer)
    const [confirmAll, setConfirmAll] = useState(false)
    if (!open) return null
    const close = () => { setConfirmAll(false); onClose() }
    const act = (fn: () => void) => { fn(); close() }
    const row = 'w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-bold rounded-xl active:opacity-70'
    return (
        <div className="fixed inset-0 z-[90] flex flex-col justify-end" onClick={close}>
            <div className="absolute inset-0" style={{ background: 'rgba(8,8,10,0.45)', backdropFilter: 'blur(3px)' }} />
            <div className="relative rounded-t-[24px] px-3 pt-3 shadow-2xl" role="dialog" aria-label="Ações da mensagem"
                onClick={(e) => e.stopPropagation()}
                style={{ background: colors.background, color: colors.textPrimary, borderTop: `1px solid ${colors.border}`, paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
                <div className="mx-auto mb-3 h-1.5 w-10 rounded-full" style={{ background: colors.border }} />
                <div className="flex items-center justify-around rounded-2xl px-2 py-2 mb-2" style={{ background: `${colors.border}40` }}>
                    {REACTION_EMOJIS.map((e) => (
                        <button key={e} onClick={() => act(() => onReact(e))} aria-label={`Reagir com ${e}`}
                            className="w-11 h-11 rounded-full flex items-center justify-center text-2xl active:scale-90 transition-transform"
                            style={{ background: myReaction === e ? `${colors.accent}30` : 'transparent', outline: myReaction === e ? `2px solid ${colors.accent}` : 'none' }}>
                            {e}
                        </button>
                    ))}
                </div>
                <div className="flex flex-col">
                    <button className={row} onClick={() => act(onReply)} style={{ color: colors.textPrimary }}><CornerUpLeft size={18} /> Responder</button>
                    {canCopy && <button className={row} onClick={() => act(onCopy)} style={{ color: colors.textPrimary }}><Copy size={18} /> Copiar</button>}
                    {canEdit && <button className={row} onClick={() => act(onEdit)} style={{ color: colors.textPrimary }}><Pencil size={18} /> Editar</button>}
                    <button className={row} onClick={() => act(onDeleteMe)} style={{ color: colors.textPrimary }}><EyeOff size={18} /> Apagar para mim</button>
                    {canDeleteAll && !confirmAll && (
                        <button className={row} onClick={() => setConfirmAll(true)} style={{ color: '#ef4444' }}><Trash2 size={18} /> Apagar para todos</button>
                    )}
                    {canDeleteAll && confirmAll && (
                        <button className={`${row} justify-center`} onClick={() => act(onDeleteAll)} style={{ background: '#ef444420', color: '#ef4444' }}>
                            <Trash2 size={18} /> Confirmar: apagar para todos
                        </button>
                    )}
                </div>
                <button onClick={close} className="w-full mt-2 py-3 rounded-xl text-sm font-black" style={{ background: `${colors.border}50`, color: colors.textPrimary }}>Fechar</button>
            </div>
        </div>
    )
}

/** Citação dentro da bolha: a mensagem respondida. Toque leva até ela. */
export function QuoteBlock({ name, text, mine, colors, onClick }: { name: string; text: string; mine: boolean; colors: Colors; onClick?: () => void }) {
    return (
        <button type="button" onClick={onClick} className="block w-full text-left mb-1.5 pl-2.5 pr-2 py-1.5 rounded-lg border-l-4"
            style={{ background: mine ? 'rgba(255,255,255,0.18)' : `${colors.border}55`, borderColor: mine ? 'rgba(255,255,255,0.7)' : colors.accent }}>
            <span className="block text-[11px] font-black truncate" style={{ color: mine ? '#fff' : colors.accent }}>{name}</span>
            <span className="block text-xs truncate opacity-85">{text}</span>
        </button>
    )
}

/** Reações embaixo da bolha: cada emoji com a contagem; tocar liga/desliga a minha. */
export function ReactionChips({ chips, onToggle, mine, colors }: { chips: ReactionChip[]; onToggle: (emoji: string) => void; mine: boolean; colors: Colors }) {
    if (!chips.length) return null
    return (
        <div className={`flex flex-wrap gap-1 -mt-1 mb-1 ${mine ? 'justify-end' : 'justify-start'}`}>
            {chips.map((c) => (
                <button key={c.emoji} onClick={() => onToggle(c.emoji)} aria-label={`${c.emoji} ${c.count}`}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-bold shadow-sm"
                    style={{ background: colors.surface, border: `1px solid ${c.mine ? colors.accent : colors.border}`, color: colors.textPrimary }}>
                    <span>{c.emoji}</span>{c.count > 1 && <span className="tabular-nums">{c.count}</span>}
                </button>
            ))}
        </div>
    )
}

/** ✓ enviada · ✓✓ azul lida (a mesma marca do WhatsApp). */
export function TickIcon({ state }: { state: Tick }) {
    if (state === 'none') return null
    if (state === 'read') return <CheckCheck size={14} color="#53bdeb" aria-label="Lida" className="inline-block align-[-2px]" />
    return <Check size={14} aria-label="Enviada" className="inline-block align-[-2px] opacity-80" />
}
