// src/components/digital/DigitalViewer.tsx — abre UM item do produto digital: vídeo e áudio tocam na própria tela, arquivo abre/baixa e link abre em outra aba.
// O link do arquivo é pedido ao servidor a cada abertura (assinado, vale 1 hora); quem não tem acesso recebe a mensagem do servidor.
'use client'

import { useEffect, useState } from 'react'
import { Download, ExternalLink, FileText, Lock } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'
import { openItem, type OpenedItem } from '@/modules/digital'

export default function DigitalViewer({ itemId, title, onEnded }: { itemId: string; title: string; onEnded?: () => void }) {
    const { colors } = useTheme()
    const [data, setData] = useState<OpenedItem | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let alive = true
        setData(null); setError(null)
        openItem(itemId).then((d) => { if (alive) setData(d) }).catch((e) => { if (alive) setError(e.message) })
        return () => { alive = false }
    }, [itemId])

    const box = 'rounded-2xl overflow-hidden w-full'
    if (error) {
        return (
            <div className={`${box} flex flex-col items-center justify-center gap-2 p-6 text-center`} style={{ background: colors.surface, border: `1px solid ${colors.border}`, minHeight: 200 }}>
                <Lock size={26} style={{ color: colors.textSecondary }} />
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>{error}</p>
            </div>
        )
    }
    if (!data) {
        return <div className={`${box} flex items-center justify-center`} style={{ background: colors.surface, border: `1px solid ${colors.border}`, minHeight: 200 }}><Spinner size={28} color={colors.accent} /></div>
    }
    if (data.kind === 'video') {
        return <video key={data.url} src={data.url} controls autoPlay playsInline controlsList="nodownload" onEnded={onEnded} className={`${box} bg-black`} style={{ aspectRatio: '16 / 9' }} />
    }
    if (data.kind === 'audio') {
        return (
            <div className={`${box} p-4 flex flex-col gap-3`} style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{title}</p>
                <audio key={data.url} src={data.url} controls autoPlay onEnded={onEnded} className="w-full" />
            </div>
        )
    }
    const btn = 'h-11 px-4 rounded-full text-sm font-black inline-flex items-center justify-center gap-2'
    return (
        <div className={`${box} p-5 flex flex-col items-center gap-3 text-center`} style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            {data.external ? <ExternalLink size={30} style={{ color: '#f97316' }} /> : <FileText size={30} style={{ color: '#f97316' }} />}
            <p className="text-sm font-black" style={{ color: colors.textPrimary }}>{title}</p>
            <div className="flex flex-wrap gap-2 justify-center">
                <a href={data.url} target="_blank" rel="noopener noreferrer" className={btn} style={{ background: '#f97316', color: '#fff' }}><ExternalLink size={16} /> Abrir</a>
                {!data.external && (
                    <button type="button" className={btn} style={{ background: `${colors.border}40`, color: colors.textPrimary }}
                        onClick={async () => { try { const d = await openItem(itemId, true); window.location.href = d.url } catch { /* a mensagem já aparece ao abrir */ } }}>
                        <Download size={16} /> Baixar
                    </button>
                )}
            </div>
        </div>
    )
}
