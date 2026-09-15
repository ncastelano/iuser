// components/PwaInstallPrompt.tsx
'use client'

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Download, X, Share, PlusSquare } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'

const DISMISS_KEY = 'pwaInstallDismissedAt'
const DISMISS_DAYS = 7
const SHOW_DELAY_MS = 2000

function isStandalone() {
    if (typeof window === 'undefined') return false
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
    )
}

function isIOS() {
    if (typeof navigator === 'undefined') return false
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function wasRecentlyDismissed() {
    const dismissedAt = localStorage.getItem(DISMISS_KEY)
    if (!dismissedAt) return false
    const daysSince = (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60 * 24)
    return daysSince < DISMISS_DAYS
}

// Convida quem visita pelo navegador (não pelo app instalado/PWA) a
// instalar o iUser. No Android/Chrome usa o prompt nativo
// (beforeinstallprompt); no iOS Safari, que nunca dispara esse evento,
// mostra o passo a passo manual (Compartilhar > Adicionar à Tela de Início).
// Nunca aparece dentro do app nativo (Capacitor) nem se já estiver
// rodando como PWA instalado.
export function PwaInstallPrompt() {
    const { colors } = useTheme()
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
    const [visible, setVisible] = useState(false)
    const [platform, setPlatform] = useState<'android' | 'ios' | null>(null)

    useEffect(() => {
        if (Capacitor.isNativePlatform()) return
        if (isStandalone()) return
        if (wasRecentlyDismissed()) return

        let timer: ReturnType<typeof setTimeout> | null = null

        const onBeforeInstallPrompt = (e: Event) => {
            e.preventDefault()
            setDeferredPrompt(e)
            timer = setTimeout(() => {
                if (wasRecentlyDismissed()) return
                setPlatform('android')
                setVisible(true)
            }, SHOW_DELAY_MS)
        }
        window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)

        // iOS Safari nunca dispara beforeinstallprompt - mostra a instrução manual direto
        if (isIOS()) {
            timer = setTimeout(() => {
                if (wasRecentlyDismissed()) return
                setPlatform('ios')
                setVisible(true)
            }, SHOW_DELAY_MS)
        }

        return () => {
            window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
            if (timer) clearTimeout(timer)
        }
    }, [])

    const handleInstall = async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt()
            await deferredPrompt.userChoice
            setDeferredPrompt(null)
        }
        setVisible(false)
    }

    const handleDismiss = () => {
        localStorage.setItem(DISMISS_KEY, String(Date.now()))
        setVisible(false)
    }

    if (!visible || !platform) return null

    return (
        <div
            className="fixed inset-x-4 z-[9999] flex items-center gap-3 rounded-2xl p-4 shadow-2xl"
            style={{
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                maxWidth: 420,
                marginInline: 'auto',
            }}
        >
            <div
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: colors.accent, color: colors.accentText }}
            >
                <Download size={20} />
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>
                    Instale o app do iUser
                </p>
                {platform === 'android' ? (
                    <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
                        Acesso mais rápido e notificações direto no seu aparelho.
                    </p>
                ) : (
                    <p className="text-xs mt-0.5 flex items-center flex-wrap gap-1" style={{ color: colors.textSecondary }}>
                        Toque em <Share size={12} className="inline" /> e depois em
                        <PlusSquare size={12} className="inline" /> "Adicionar à Tela de Início"
                    </p>
                )}
            </div>

            {platform === 'android' && (
                <button
                    onClick={handleInstall}
                    className="flex-shrink-0 px-4 py-2 rounded-xl font-black uppercase text-[10px] tracking-wider text-white"
                    style={{ background: colors.accent }}
                >
                    Instalar
                </button>
            )}

            <button
                onClick={handleDismiss}
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: colors.background, color: colors.textSecondary }}
                aria-label="Fechar"
            >
                <X size={14} />
            </button>
        </div>
    )
}
