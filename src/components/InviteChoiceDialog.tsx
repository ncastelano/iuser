// src/components/InviteChoiceDialog.tsx
//
// "Indicar e ganhar": a pessoa escolhe entre CONVIDAR agora (abre o diálogo padrão de compartilhar com o link de convite dela) ou ver os
// DETALHES DA REDE (Minha rede, no painel do perfil: quem ela indicou, saldo e comissões). O link/comissão são os de sempre
// (/convite?ref=<perfil>); aqui só se escolhe o caminho.
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Network, Send, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import ShareLinkDialog, { copyText } from '@/components/ShareLinkDialog'

/** Endereço do painel do perfil já aberto em "Detalhes da rede" (a 2.0 mostra o painel dentro da home; a 3.0 tem a página própria) */
export const NETWORK_DETAILS_PATH = '/?view=perfil&secao=rede'

export default function InviteChoiceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { colors } = useTheme()
    const router = useRouter()
    const { profileSlug } = useProfile()
    const [shareOpen, setShareOpen] = useState(false)

    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open, onClose])

    const inviteUrl = typeof window !== 'undefined' && profileSlug ? `${window.location.origin}/convite?ref=${profileSlug}` : ''
    const inviteText = `@${profileSlug} te chama pro iUser — compre, venda, preste serviço ou dirija, tudo numa plataforma só, sem taxa escondida.\n\nEntre pelo meu link e comece agora:`

    const invite = async () => {
        if (await copyText(inviteUrl)) toast.success('Link de convite copiado!')
        onClose()
        setShareOpen(true)
    }
    const details = () => { onClose(); router.push(NETWORK_DETAILS_PATH) }

    const option = (icon: React.ReactNode, title: string, desc: string, onClick: () => void, primary = false) => (
        <button
            onClick={onClick}
            className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition active:scale-[0.98]"
            style={primary ? { background: colors.accent, color: colors.accentText } : { background: `${colors.border}30`, color: colors.textPrimary, border: `1px solid ${colors.border}` }}
        >
            <span className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: primary ? 'rgba(255,255,255,0.22)' : colors.surface }}>{icon}</span>
            <span className="min-w-0">
                <span className="block text-[15px] font-black leading-tight">{title}</span>
                <span className="block text-[12px] leading-snug mt-0.5" style={{ opacity: primary ? 0.9 : 0.75 }}>{desc}</span>
            </span>
        </button>
    )

    return (
        <>
            {open && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Indicar e ganhar">
                    <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-3" style={{ background: colors.surface, color: colors.textPrimary, border: `1px solid ${colors.border}` }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-black leading-tight">Indicar e ganhar</h2>
                                <p className="text-[13px] mt-1" style={{ color: colors.textSecondary }}>Convide pessoas para o iUser e receba comissão pelas indicações.</p>
                            </div>
                            <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${colors.border}55`, color: colors.textSecondary }}><X size={16} /></button>
                        </div>
                        {option(<Send size={20} />, 'Convidar agora', 'Copie ou envie seu link de convite', invite, true)}
                        {option(<Network size={20} style={{ color: colors.accent }} />, 'Ver detalhes da rede', 'Quem você indicou, saldo e comissões', details)}
                    </div>
                </div>,
                document.body,
            )}
            <ShareLinkDialog open={shareOpen} onClose={() => setShareOpen(false)} url={inviteUrl} title="Convidar para o iUser" text={inviteText} internal={false} />
        </>
    )
}

