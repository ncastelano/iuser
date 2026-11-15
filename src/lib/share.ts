import { toast } from '@/lib/toast'

export interface ShareOptions {
    title: string
    text?: string
    url?: string
}

export interface ShareDialogOptions extends ShareOptions { url: string; text: string; imageUrl?: string | null }

// O diálogo padrão de compartilhar (components/ShareDialogHost) se registra aqui quando o app abre; assim todo botão "Compartilhar" que já
// chama handleShareLink passa a abrir o MESMO diálogo (copiar, redes, comunidade, perfil). Resolve true se a pessoa realmente compartilhou.
let openShareDialog: ((o: ShareDialogOptions) => Promise<boolean>) | null = null
export function registerShareDialog(fn: ((o: ShareDialogOptions) => Promise<boolean>) | null) { openShareDialog = fn }

/**
 * Compartilhar: abre o diálogo padrão do iUser (e, sem ele, o compartilhar do aparelho ou copiar o link).
 * Resolve true só se a pessoa compartilhou de fato (copiou, mandou para uma rede, comunidade ou perfil).
 */
export async function handleShareLink({ title, text, url, imageUrl }: ShareOptions & { imageUrl?: string | null }) {
    const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '')
    const shareText = text || title

    if (openShareDialog) return openShareDialog({ title, text: shareText, url: shareUrl, imageUrl })

    if (typeof window !== 'undefined' && navigator.share) {
        try {
            await navigator.share({
                title,
                text: shareText,
                url: shareUrl,
            })
            return true
        } catch (err: any) {
            // User cancelled sharing or platform error
            if (err.name !== 'AbortError') {
                console.warn('[Share] Erro no Web Share API, utilizando clipboard fallback:', err)
            } else {
                return false
            }
        }
    }

    // Fallback: Copy to clipboard
    if (typeof window !== 'undefined' && navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(shareUrl)
            toast.success('Link copiado para a área de transferência!')
            return true
        } catch (err) {
            console.error('[Share] Erro ao copiar link:', err)
            toast.error('Não foi possível copiar o link.')
            return false
        }
    }

    toast.error('Compartilhamento não suportado neste navegador.')
    return false
}
