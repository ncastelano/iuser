import { toast } from 'sonner'

export interface ShareOptions {
    title: string
    text?: string
    url?: string
}

/**
 * Utility function to share content via Web Share API or copy link to clipboard.
 */
export async function handleShareLink({ title, text, url }: ShareOptions) {
    const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '')
    const shareText = text || title

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
