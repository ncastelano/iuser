// src/components/digital/DigitalContentManager.tsx — o vendedor monta o conteúdo do produto digital: sobe arquivos (vídeo-aula, PDF, planilha...) ou cola links,
// agrupa em módulos, marca "aula grátis" (prévia na vitrine) e ordena. Os arquivos vão para o bucket PRIVADO digital-files, na pasta da própria pessoa.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Link2, Trash2, Upload } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from '@/lib/toast'
import { addFileItem, addLinkItem, formatDuration, formatSize, groupByModule, listOwnItems, removeItem, setItemPreview, swapItems, curriculumSummary, type OwnItem, type CurriculumItem } from '@/modules/digital'
import { kindIcon } from './DigitalCurriculum'

export default function DigitalContentManager({ productId }: { productId: string }) {
    const { colors } = useTheme()
    const { userId } = useProfile()
    const [items, setItems] = useState<OwnItem[]>([])
    const [busy, setBusy] = useState(false)
    const [title, setTitle] = useState('')
    const [moduleTitle, setModuleTitle] = useState('')
    const [url, setUrl] = useState('')
    const [preview, setPreview] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    const load = useCallback(async () => { try { setItems(await listOwnItems(productId)) } catch (e: any) { toast.error(e.message) } }, [productId])
    useEffect(() => { load() }, [load])

    const run = async (fn: () => Promise<void>, ok?: string) => {
        setBusy(true)
        try { await fn(); if (ok) toast.success(ok); await load() } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(false) }
    }
    const onFile = (f: File | undefined) => {
        if (!f || !userId) return
        run(async () => {
            await addFileItem({ uid: userId, productId, file: f, title: title.trim() || f.name.replace(/\.[^.]+$/, ''), moduleTitle, isPreview: preview })
            setTitle(''); setPreview(false)
        }, 'Arquivo enviado ✓')
        if (fileRef.current) fileRef.current.value = ''
    }

    const field = 'w-full h-11 rounded-full px-4 text-sm outline-none'
    const fs = { background: `${colors.border}26`, color: colors.textPrimary, border: `1px solid ${colors.border}` }
    const asCurriculum: CurriculumItem[] = items.map((i) => ({ ...i, unlocked: true }))
    return (
        <div className="flex flex-col gap-3">
            <div>
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Conteúdo digital</p>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>{curriculumSummary(asCurriculum)}. Quem comprar abre tudo aqui depois que você confirmar o pagamento; a aula marcada como grátis qualquer pessoa assiste.</p>
            </div>

            <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: `${colors.border}1f`, border: `1px solid ${colors.border}` }}>
                <input className={field} style={fs} placeholder="Nome da aula ou do arquivo" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
                <input className={field} style={fs} placeholder="Módulo (opcional) — ex.: Módulo 1 · Primeiros passos" value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} maxLength={100} list={`mods-${productId}`} />
                <datalist id={`mods-${productId}`}>{groupByModule(items).filter((g) => g.title).map((g) => <option key={g.title} value={g.title!} />)}</datalist>
                <label className="flex items-center gap-2 text-[12px] font-bold cursor-pointer" style={{ color: colors.textPrimary }}>
                    <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> Aula grátis (aparece aberta na vitrine)
                </label>
                <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="flex-1 h-11 rounded-full text-sm font-black inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: '#f97316', color: '#fff' }}>
                        <Upload size={16} /> {busy ? 'Enviando…' : 'Enviar arquivo'}
                    </button>
                    <input ref={fileRef} type="file" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                </div>
                <div className="flex gap-2">
                    <input className={field} style={fs} placeholder="ou cole um link https:// (aula hospedada fora)" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" />
                    <button type="button" disabled={busy || !url.trim() || !userId} className="h-11 px-4 rounded-full text-sm font-black inline-flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0" style={{ background: `${colors.border}55`, color: colors.textPrimary }}
                        onClick={() => run(async () => { await addLinkItem({ uid: userId!, productId, url, title: title.trim() || 'Link', moduleTitle, isPreview: preview }); setUrl(''); setTitle(''); setPreview(false) }, 'Link adicionado ✓')}>
                        <Link2 size={16} /> Adicionar
                    </button>
                </div>
            </div>

            {items.length === 0 ? (
                <p className="text-[12px] text-center py-2" style={{ color: colors.textSecondary }}>Nenhum conteúdo ainda. Envie o primeiro arquivo acima.</p>
            ) : groupByModule(items).map((g, gi) => (
                <div key={gi} className="flex flex-col gap-1.5">
                    {g.title && <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>{g.title}</p>}
                    {g.items.map((it) => {
                        const idx = items.findIndex((x) => x.id === it.id)
                        return (
                            <div key={it.id} className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: `${colors.border}26` }}>
                                <span style={{ color: '#f97316' }}>{kindIcon(it.kind, 18)}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-bold truncate" style={{ color: colors.textPrimary }}>{it.title}</span>
                                    <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{[formatDuration(it.duration_seconds), formatSize(it.size_bytes), it.external_url ? 'link' : ''].filter(Boolean).join(' · ') || ' '}</span>
                                </span>
                                <button type="button" disabled={busy} onClick={() => run(() => setItemPreview(it.id, !it.is_preview))} className="text-[10px] font-black rounded-full px-2 py-1"
                                    style={{ background: it.is_preview ? '#22c55e22' : `${colors.border}55`, color: it.is_preview ? '#16a34a' : colors.textSecondary }}>{it.is_preview ? 'Grátis' : 'Pago'}</button>
                                <button type="button" aria-label="Subir" disabled={busy || idx <= 0} onClick={() => run(() => swapItems(it, items[idx - 1]))} className="p-1 disabled:opacity-30" style={{ color: colors.textSecondary }}><ArrowUp size={15} /></button>
                                <button type="button" aria-label="Descer" disabled={busy || idx >= items.length - 1} onClick={() => run(() => swapItems(it, items[idx + 1]))} className="p-1 disabled:opacity-30" style={{ color: colors.textSecondary }}><ArrowDown size={15} /></button>
                                <button type="button" aria-label="Apagar" disabled={busy} onClick={() => { if (confirm(`Apagar "${it.title}"?`)) run(() => removeItem(it), 'Item apagado') }} className="p-1" style={{ color: '#ef4444' }}><Trash2 size={15} /></button>
                            </div>
                        )
                    })}
                </div>
            ))}
        </div>
    )
}
