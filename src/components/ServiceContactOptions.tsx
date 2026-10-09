// "Como falar com você" de um serviço: o WhatsApp do perfil e/ou o botão de conversa do iUser — cada serviço escolhe.
// Ligar a conversa liga também o chat do perfil (sem isso o botão não conseguiria abrir a conversa).
'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, MessagesSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'

interface Props {
    ownerId: string
    colors: any
    showWhatsapp: boolean
    showChat: boolean
    onChange: (next: { showWhatsapp: boolean; showChat: boolean }) => void
}

export default function ServiceContactOptions({ ownerId, colors, showWhatsapp, showChat, onChange }: Props) {
    const [whatsapp, setWhatsapp] = useState<string | null | undefined>(undefined)

    useEffect(() => {
        supabase.from('profiles').select('whatsapp').eq('id', ownerId).maybeSingle().then(({ data }) => setWhatsapp(data?.whatsapp || null))
    }, [ownerId])

    const hasWhatsapp = !!whatsapp
    const row = (
        icon: React.ReactNode, title: string, text: string, on: boolean, disabled: boolean, toggle: () => void,
    ) => (
        <div className="flex items-center justify-between gap-3 p-3 rounded-2xl" style={{ border: `1px solid ${colors.border}`, opacity: disabled ? 0.55 : 1 }}>
            <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>{icon}</span>
                <div className="min-w-0">
                    <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{title}</p>
                    <p className="text-[11px]" style={{ color: colors.textSecondary }}>{text}</p>
                </div>
            </div>
            <button
                type="button"
                onClick={toggle}
                disabled={disabled}
                aria-label={title}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:cursor-not-allowed ${on && !disabled ? 'bg-orange-500' : 'bg-gray-400'}`}
            >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${on && !disabled ? 'right-1' : 'left-1'}`} />
            </button>
        </div>
    )

    return (
        <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase block" style={{ color: colors.textSecondary }}>Como falar com você</label>
            {row(
                <MessageCircle size={16} />, 'WhatsApp do perfil',
                hasWhatsapp ? `Mostra o botão com o seu WhatsApp (${whatsapp})` : 'Cadastre o seu WhatsApp em Configurações para poder mostrar',
                showWhatsapp, !hasWhatsapp, () => onChange({ showWhatsapp: !showWhatsapp, showChat }),
            )}
            {row(
                <MessagesSquare size={16} />, 'Conversa pelo iUser',
                'Mostra o botão "Conversar": a pessoa fala com você dentro do iUser',
                showChat, false,
                async () => {
                    const next = !showChat
                    if (next) await supabase.from('profiles').update({ chat_enabled: true }).eq('id', ownerId)
                    onChange({ showWhatsapp, showChat: next })
                },
            )}
        </div>
    )
}
