// src/components/ShareDialogHost.tsx
//
// Monta UMA vez (providers.tsx) o diálogo padrão de compartilhar e o registra em lib/share: todo `handleShareLink(...)` do app abre este
// diálogo e recebe true se a pessoa compartilhou de fato (por isso os contadores de compartilhamento só sobem quando houve compartilhamento).
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import ShareLinkDialog from '@/components/ShareLinkDialog'
import { registerShareDialog, type ShareDialogOptions } from '@/lib/share'

export default function ShareDialogHost() {
    const [opts, setOpts] = useState<ShareDialogOptions | null>(null)
    const shared = useRef(false)
    const resolver = useRef<((ok: boolean) => void) | null>(null)

    const finish = useCallback(() => {
        resolver.current?.(shared.current)
        resolver.current = null
        setOpts(null)
    }, [])

    useEffect(() => {
        registerShareDialog((o) => new Promise<boolean>((resolve) => {
            resolver.current?.(false)   // abriu outro antes de fechar este
            shared.current = false
            resolver.current = resolve
            setOpts(o)
        }))
        return () => registerShareDialog(null)
    }, [])

    return (
        <ShareLinkDialog
            open={!!opts}
            onClose={finish}
            onShared={() => { shared.current = true }}
            url={opts?.url || ''}
            title={opts?.title || 'Compartilhar'}
            text={opts?.text || ''}
            imageUrl={opts?.imageUrl}
        />
    )
}
