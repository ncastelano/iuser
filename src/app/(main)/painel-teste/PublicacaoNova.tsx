// src/app/(main)/painel-teste/PublicacaoNova.tsx — o modelo de "Nova publicação" do laboratório /painel-teste (só teste, nada grava).
// Os campos são os mesmos do app real (`StorePublication`): imagem, título e texto. A foto escolhida aparece só na prévia.
'use client'

import { useRef, useState } from 'react'
import { Eye, ImagePlus, Megaphone, Share2, Sparkles, Trash2, Users, Check } from 'lucide-react'
import type { ThemeColors } from '@/app/contexts/theme'
import { FolhaCasca, useAviso } from './labui'

export interface Post { id: number; t: string; texto?: string; likes: number; coments: number; views: number; shares: number; quando: string; img?: string | null }

export default function PublicacaoNova({ c, cor, onClose, onPublicar }: { c: ThemeColors; cor: string; onClose: () => void; onPublicar: (p: Post) => void }) {
    const [titulo, setTitulo] = useState('')
    const [texto, setTexto] = useState('')
    const [img, setImg] = useState<string | null>(null)
    const arq = useRef<HTMLInputElement>(null)
    const { mostrar, node } = useAviso()
    const ok = titulo.trim().length > 1 || texto.trim().length > 1 || !!img
    const escolheu = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0]; e.target.value = ''
        if (!f) return
        if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(f.type)) { mostrar('Use uma foto JPEG, PNG, WebP, GIF ou AVIF'); return }
        if (f.size > 5 * 1024 * 1024) { mostrar('A imagem passa de 5 MB'); return }
        setImg(URL.createObjectURL(f))
    }
    const campo = { background: c.surface, border: `1.5px solid ${c.border}`, color: c.textPrimary }
    const rot = (t: string, n?: string) => <p className="text-[11px] font-black uppercase tracking-wider mb-1.5 mt-4 flex justify-between" style={{ color: c.textSecondary }}><span>{t}</span>{n && <span className="font-bold normal-case tracking-normal">{n}</span>}</p>
    return (
        <FolhaCasca titulo="Nova publicação" sub="Pizzaria Forno de Ouro" cor={cor} icone={<Megaphone size={18} />} onClose={onClose} z={95}
            rodape={<button disabled={!ok} onClick={() => onPublicar({ id: Date.now(), t: titulo.trim() || texto.trim().slice(0, 60), texto: texto.trim(), likes: 0, coments: 0, views: 0, shares: 0, quando: 'agora', img })} className="w-full h-12 rounded-full text-[14px] font-black text-white disabled:opacity-40 active:scale-95 transition" style={{ background: cor }}>Publicar agora</button>}>
            {node}
            <input ref={arq} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={escolheu} />
            {rot('Imagem', 'opcional')}
            {img ? (
                <div className="relative rounded-3xl overflow-hidden" style={{ aspectRatio: '16 / 10' }}>
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <button onClick={() => setImg(null)} aria-label="Tirar a imagem" className="absolute top-2 right-2 w-9 h-9 rounded-full flex items-center justify-center text-white" style={{ background: 'rgba(0,0,0,.55)' }}><Trash2 size={16} /></button>
                </div>
            ) : (
                <button onClick={() => arq.current?.click()} className="w-full rounded-3xl flex flex-col items-center justify-center gap-1.5 active:scale-[.99]" style={{ border: `1.5px dashed ${c.border}`, color: c.textSecondary, minHeight: 120 }}>
                    <ImagePlus size={24} /><span className="text-[13px] font-black">Escolher foto da galeria</span><span className="text-[11px]">Até 5 MB · quadrada ou 16:10 fica melhor</span>
                </button>
            )}

            {rot('Título', `${titulo.length}/60`)}
            <input value={titulo} onChange={(e) => setTitulo(e.target.value.slice(0, 60))} placeholder="Ex.: Promoção de verão!" className="w-full h-12 rounded-2xl px-3.5 text-[14px] font-semibold outline-none" style={campo} />
            {rot('Texto', `${texto.length}/500`)}
            <textarea value={texto} onChange={(e) => setTexto(e.target.value.slice(0, 500))} rows={4} placeholder="Conte a novidade: um prato novo, um aviso, uma promoção…" className="w-full rounded-2xl px-3.5 py-3 text-[14px] font-medium outline-none resize-none" style={campo} />

            {rot('Como vai aparecer')}
            <div className="rounded-3xl overflow-hidden" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                <div className="flex gap-3 p-3">
                    <span className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{ background: `${cor}22`, color: cor }}>{img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <Megaphone size={22} />}</span>
                    <div className="min-w-0"><p className="text-[13px] font-black leading-snug">{titulo.trim() || <span style={{ color: c.textSecondary }}>Seu título aparece aqui</span>}</p><p className="text-[12px] leading-snug mt-0.5 line-clamp-2" style={{ color: c.textSecondary }}>{texto.trim() || 'O texto da publicação.'}</p><p className="text-[11px] mt-1" style={{ color: c.textSecondary }}>Pizzaria Forno de Ouro · agora</p></div>
                </div>
            </div>

            {rot('Onde aparece')}
            <div className="space-y-1.5">
                {[[<Users key="a" size={14} />, 'Perfil da loja', 'na aba Publicações'], [<Sparkles key="b" size={14} />, 'Social', 'seção “Publicações das pessoas”'], [<Eye key="c" size={14} />, 'Feed do Flash', 'aba Publicações']].map(([ic, t, s]) => (
                    <div key={String(t)} className="flex items-center gap-2.5 text-[12.5px]"><span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#16a34a22', color: '#16a34a' }}>{ic as React.ReactNode}</span><span className="flex-1"><b>{t as string}</b> <span style={{ color: c.textSecondary }}>· {s as string}</span></span><Check size={14} style={{ color: '#16a34a' }} /></div>
                ))}
            </div>
            <div className="rounded-2xl p-3 mt-4 flex items-center gap-2.5" style={{ background: `${cor}14`, border: `1px solid ${cor}44` }}><Share2 size={16} style={{ color: cor }} /><p className="text-[12px] font-semibold leading-snug flex-1">Missão do dia: <b>fazer uma publicação</b> vale <b>+5 pontos</b> no Outdoor da loja.</p></div>
        </FolhaCasca>
    )
}
