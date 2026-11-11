'use client'

// Folha "Logo e moldura" (painel da loja da 3.0; abre ao tocar no logo de "Sua loja"), no desenho do laboratório /painel-teste:
// a foto do logo (galeria ou câmera, com prévia antes de salvar; vai para o bucket store-logos) e a ESCADA DE MOLDURAS — a moldura não se
// escolhe, se CONQUISTA pelos pontos da loja no Outdoor (níveis em `store_levels`, editados pelo admin; o nível em `stores.store_level`).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Check, Crown, ImageIcon, Lock, Store, X } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { useTheme } from '@/app/contexts/theme'
import { lockBodyScroll } from '@/lib/bodyScrollLock'
import { cachedStoreLevels, loadStoreLevels, type StoreLevel } from '@/modules/store-levels'
import { loadStoreMissions } from '@/modules/missions'
import StoreFrame from '@/components/store/StoreFrame'

const ORANGE = '#f97316'

export default function LogoFolha({ storeId, storeName, logoUrl, level, onClose, onSaved }: {
    storeId: string; storeName: string; logoUrl: string | null; level: number; onClose: () => void; onSaved: (publicUrl: string) => void
}) {
    const { colors: c } = useTheme()
    const [levels, setLevels] = useState<StoreLevel[]>(cachedStoreLevels())
    const [points, setPoints] = useState<number | null>(null)
    const [file, setFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const galeria = useRef<HTMLInputElement>(null)
    const camera = useRef<HTMLInputElement>(null)

    useEffect(() => lockBodyScroll(), [])
    useEffect(() => {
        loadStoreLevels().then(setLevels).catch(() => {})
        loadStoreMissions(storeId).then((m) => setPoints(m?.level?.points ?? null)).catch(() => {})
    }, [storeId])
    useEffect(() => {
        if (!file) { setPreview(null); return }
        const u = URL.createObjectURL(file)
        setPreview(u)
        return () => URL.revokeObjectURL(u)
    }, [file])

    const salvar = async () => {
        if (!file) return
        setSaving(true)
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const { data, error } = await supabase.storage.from('store-logos').upload(`${Date.now()}.${ext}`, file)
        if (error || !data) { setSaving(false); toast.error('Não deu para enviar a foto', { description: error?.message }); return }
        const { error: e2 } = await supabase.from('stores').update({ logo_url: data.path }).eq('id', storeId)
        setSaving(false)
        if (e2) { toast.error('Não deu para trocar o logo', { description: e2.message }); return }
        const url = supabase.storage.from('store-logos').getPublicUrl(data.path).data.publicUrl
        toast.success('Logo trocado', { description: 'Já aparece na loja, nos cartões e no Radar.' })
        onSaved(url)
    }

    const atual = preview || logoUrl
    const escada = [...levels].sort((a, b) => a.level - b.level)
    const prox = escada.find((l) => l.level > level)

    return createPortal(
        <div className="fixed inset-x-0 top-0 z-[80] flex items-end justify-center" style={{ bottom: 'var(--staging-banner-h, 0px)' }}>
            <button aria-label="Fechar" onClick={onClose} className="absolute inset-0" style={{ background: 'rgba(0,0,0,.5)' }} />
            <div role="dialog" aria-modal="true" aria-label="Logo e moldura" className="relative w-full max-w-md max-h-[90dvh] flex flex-col rounded-t-[28px]" style={{ background: c.background, border: `1px solid ${c.border}`, color: c.textPrimary }}>
                <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                    <div className="flex-1 min-w-0"><p className="text-[17px] font-black">Logo e moldura</p><p className="text-[11.5px]" style={{ color: c.textSecondary }}>{storeName}</p></div>
                    <button onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full flex items-center justify-center" style={{ border: `1px solid ${c.border}` }}><X size={16} /></button>
                </div>
                <div className="overflow-y-auto px-4 pb-3 min-h-0">
                    <div className="flex flex-col items-center py-3">
                        <StoreFrame level={level} size={112} innerRadius={30}>
                            <span className="w-28 h-28 rounded-[30px] overflow-hidden flex items-center justify-center" style={{ background: `${c.border}55` }}>
                                {atual ? <img src={atual} alt="" className="w-full h-full object-cover" /> : <Store size={40} style={{ color: ORANGE }} />}
                            </span>
                        </StoreFrame>
                        {preview && <p className="text-[11.5px] font-black mt-2" style={{ color: ORANGE }}>Prévia — ainda não salvo</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => galeria.current?.click()} className="h-11 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ border: `1px solid ${c.border}` }}><ImageIcon size={15} />Galeria</button>
                        <button onClick={() => camera.current?.click()} className="h-11 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ border: `1px solid ${c.border}` }}><Camera size={15} />Câmera</button>
                        <input ref={galeria} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    </div>

                    <p className="text-[11px] font-black uppercase tracking-wider mt-5 mb-1" style={{ color: c.textSecondary }}>A moldura se conquista</p>
                    <p className="text-[12px] leading-snug mb-2" style={{ color: c.textSecondary }}>Ela muda sozinha com os pontos da loja no Outdoor (vendas, clientes, avaliações, missões do dia). Sobe na hora; desce só um degrau por vez, depois de uma semana abaixo da linha.</p>
                    {points !== null && prox && (
                        <div className="rounded-2xl p-3 mb-2" style={{ background: '#fbbf2422', border: '1px solid #fbbf2466' }}>
                            <p className="text-[12.5px] font-black flex items-center gap-1.5"><Crown size={14} style={{ color: '#b45309' }} />{points.toLocaleString('pt-BR')} pontos · faltam {Math.max(0, prox.minPoints - points).toLocaleString('pt-BR')} para {prox.name}</p>
                            <span className="block h-2 rounded-full overflow-hidden mt-2" style={{ background: `${c.border}70` }}><span className="block h-full rounded-full" style={{ width: `${Math.min(100, (points / Math.max(1, prox.minPoints)) * 100)}%`, background: 'linear-gradient(90deg,#f97316,#fbbf24)' }} /></span>
                        </div>
                    )}
                    <div className="rounded-3xl overflow-hidden" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                        {escada.map((l, i) => {
                            const tenho = l.level <= level
                            return (
                                <div key={l.level} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderTop: i ? `1px solid ${c.border}` : undefined, background: l.level === level ? `${ORANGE}12` : undefined }}>
                                    <StoreFrame level={l.level} size={40} innerRadius={11}>
                                        <span className="w-10 h-10 rounded-[11px] overflow-hidden flex items-center justify-center" style={{ background: `${c.border}55`, opacity: tenho ? 1 : 0.5 }}>
                                            {logoUrl ? <img src={logoUrl} alt="" className="w-full h-full object-cover" /> : <Store size={16} style={{ color: ORANGE }} />}
                                        </span>
                                    </StoreFrame>
                                    <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-black leading-tight">Nível {l.level} · {l.name}</span><span className="block text-[11px] leading-tight" style={{ color: c.textSecondary }}>{l.minPoints.toLocaleString('pt-BR')} pontos{l.description ? ` · ${l.description}` : ''}</span></span>
                                    {l.level === level ? <span className="text-[10.5px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: ORANGE }}>Sua</span> : tenho ? <Check size={16} style={{ color: '#16a34a' }} /> : <Lock size={15} style={{ color: c.textSecondary }} />}
                                </div>
                            )
                        })}
                    </div>
                </div>
                <div className="px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom))]" style={{ borderTop: `1px solid ${c.border}` }}>
                    <button disabled={!file || saving} onClick={salvar} className="w-full h-12 rounded-full text-[14px] font-black text-white disabled:opacity-40" style={{ background: ORANGE }}>{saving ? 'Enviando…' : file ? 'Salvar novo logo' : 'Escolha uma foto para trocar'}</button>
                </div>
            </div>
        </div>,
        document.body,
    )
}
