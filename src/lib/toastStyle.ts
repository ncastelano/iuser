// src/lib/toastStyle.ts — cor e símbolo de cada tipo de aviso (ilha e pílula usam o mesmo)
import type { ToastKind } from '@/lib/toast'
export function toastStyle(kind: ToastKind): { color: string; glyph: string } {
    switch (kind) {
        case 'success': return { color: '#22c55e', glyph: '✓' }
        case 'error': return { color: '#ef4444', glyph: '!' }
        case 'info': return { color: '#3b82f6', glyph: 'i' }
        default: return { color: '#f97316', glyph: '●' }
    }
}
