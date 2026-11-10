'use client'

// A FOTO que a pessoa anexou à avaliação (compra ou serviço; migration 20261130000063): miniatura que amplia ao tocar.
// O caminho está no bucket público `posts`; o link sai pelo proxy de imagens (getPublicUrl do cliente).
import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import ImageZoomDialog from '@/components/ImageZoomDialog'

export default function ReviewPhoto({ path, size = 72 }: { path: string | null | undefined; size?: number }) {
    const [zoom, setZoom] = useState(false)
    if (!path) return null
    const src = supabase.storage.from('posts').getPublicUrl(path).data.publicUrl
    return (
        <>
            <button type="button" onClick={(e) => { e.stopPropagation(); setZoom(true) }} aria-label="Ver a foto da avaliação" className="mt-2 rounded-xl overflow-hidden block flex-shrink-0" style={{ width: size, height: size }}>
                <img src={src} alt="Foto da avaliação" loading="lazy" className="w-full h-full object-cover" />
            </button>
            {zoom && <ImageZoomDialog src={src} alt="Foto da avaliação" onClose={() => setZoom(false)} />}
        </>
    )
}
