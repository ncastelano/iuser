// src/app/(main)/painel-teste/LogoFolha.tsx — o LOGO da loja com a moldura do nível (botão) e a folha "Logo e moldura" do laboratório /painel-teste
// (só teste, dados de exemplo, nada grava). A moldura NÃO é escolhida: ela é conquistada pelos pontos do Outdoor (NÍVEIS DE LOJA); a folha
// mostra a atual e a escada inteira (o que já tem, o que falta).
'use client'

import { Camera, Check, Crown, ImagePlus, Lock, Store, Trash2 } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import StoreFrame from '@/components/store/StoreFrame'
import { DEFAULT_STORE_LEVELS, levelOf, nextLevel } from '@/modules/store-levels'
import { FolhaCasca, useAviso } from './labui'

export const LOGOS = ['#b91c1c', '#2563eb', '#16a34a', '#7c3aed', '#f59e0b', '#0f172a']
const LV = DEFAULT_STORE_LEVELS

/** o logo (quadrado arredondado) dentro da moldura do nível; com `onClick` vira botão com a câmera no canto */
export function LogoBtn({ nivel, cor, size = 48, onClick }: { nivel: number; cor: string; size?: number; onClick?: () => void }) {
    const logo = (
        <span className="relative flex items-center justify-center text-white" style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: cor }}>
            <Store size={Math.round(size * 0.46)} />
        </span>
    )
    const quadro = <StoreFrame level={nivel} size={size} innerRadius={Math.round(size * 0.3)}>{logo}</StoreFrame>
    if (!onClick) return quadro
    return (
        <button onClick={onClick} aria-label="Trocar o logo e ver a moldura" className="relative flex-shrink-0 active:scale-95 transition">
            {quadro}
            <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-white shadow" style={{ background: '#f97316', border: '2px solid #fff' }}><Camera size={12} /></span>
        </button>
    )
}

export default function LogoFolha({ nivel, pontos, cor, setCor, onClose }: { nivel: number; pontos: number; cor: string; setCor: (c: string) => void; onClose: () => void }) {
    const { colors } = useTheme()
    const { mostrar, node } = useAviso()
    const atual = levelOf(LV, nivel)
    const prox = nextLevel(LV, nivel)
    return (
        <FolhaCasca titulo="Logo e moldura" sub="Pizzaria Forno de Ouro" cor="#f97316" icone={<Store size={18} />} onClose={onClose} z={95}
            rodape={<button onClick={() => { onClose() }} className="w-full h-12 rounded-full text-[14px] font-black text-white active:scale-95" style={{ background: '#f97316' }}>Pronto</button>}>
            {node}
            <div className="flex flex-col items-center py-2">
                <LogoBtn nivel={nivel} cor={cor} size={92} />
                <p className="text-[13px] font-black mt-4 flex items-center gap-1.5"><Crown size={14} style={{ color: '#d97706' }} />{nivel > 0 ? `Nível ${nivel} · ${atual.name}` : 'Sem moldura ainda'}</p>
                <p className="text-[11.5px]" style={{ color: colors.textSecondary }}>{pontos.toLocaleString('pt-BR')} pontos no Outdoor</p>
            </div>

            <p className="text-[11px] font-black uppercase tracking-wider mb-2 mt-1" style={{ color: colors.textSecondary }}>Trocar a imagem</p>
            <div className="grid grid-cols-2 gap-2">
                <button onClick={() => mostrar('Abriria a câmera (exemplo)')} className="h-11 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ border: `1px solid ${colors.border}` }}><Camera size={15} />Tirar foto</button>
                <button onClick={() => mostrar('Abriria a galeria — toque numa das imagens abaixo')} className="h-11 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ border: `1px solid ${colors.border}` }}><ImagePlus size={15} />Da galeria</button>
            </div>
            <div className="flex gap-2 mt-2.5 items-center">
                {LOGOS.map((c) => (
                    <button key={c} onClick={() => { setCor(c); mostrar('Logo trocado') }} aria-label="Usar esta imagem" className="w-11 h-11 rounded-2xl flex items-center justify-center text-white active:scale-90" style={{ background: c, outline: cor === c ? '3px solid #f97316' : 'none', outlineOffset: 2 }}>{cor === c ? <Check size={16} /> : <Store size={16} />}</button>
                ))}
                <button onClick={() => { setCor('#9ca3af'); mostrar('Logo removido') }} aria-label="Remover o logo" className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ border: `1px solid ${colors.border}`, color: '#ef4444' }}><Trash2 size={16} /></button>
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: colors.textSecondary }}>Quadrado, a partir de 400 × 400 px, até 5 MB. A moldura se ajusta sozinha.</p>

            <p className="text-[11px] font-black uppercase tracking-wider mb-1 mt-5" style={{ color: colors.textSecondary }}>Molduras da loja</p>
            <p className="text-[11.5px] leading-snug mb-2.5" style={{ color: colors.textSecondary }}>A moldura <b>não é escolhida</b>: ela é conquistada pelos pontos do Outdoor, e sobe sozinha. Estas são todas — {prox ? `faltam ${(prox.minPoints - pontos).toLocaleString('pt-BR')} pontos para a ${prox.name}.` : 'você já tem a mais alta.'}</p>
            <div className="rounded-3xl overflow-hidden" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                {LV.map((l, i) => {
                    const tem = l.level <= nivel
                    return (
                        <div key={l.level} className="flex items-center gap-3 px-3.5 py-3" style={{ borderTop: i ? `1px solid ${colors.border}` : undefined, opacity: tem ? 1 : 0.7 }}>
                            <LogoBtn nivel={l.level} cor={cor} size={44} />
                            <div className="min-w-0 flex-1">
                                <p className="text-[13.5px] font-black leading-tight">{l.name}{l.level === nivel && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full align-middle text-white" style={{ background: '#16a34a' }}>SUA</span>}</p>
                                <p className="text-[11.5px] leading-tight" style={{ color: colors.textSecondary }}>{l.description} · {l.minPoints === 0 ? 'de início' : `${l.minPoints.toLocaleString('pt-BR')} pontos`}</p>
                            </div>
                            {tem ? <Check size={17} style={{ color: '#16a34a' }} /> : <Lock size={15} style={{ color: colors.textSecondary }} />}
                        </div>
                    )
                })}
            </div>
            <p className="text-[11.5px] leading-snug mt-2.5" style={{ color: colors.textSecondary }}>Para subir: venda, atenda, publique e cumpra as missões do dia. Se a loja ficar parada, a moldura desce só um degrau por vez e depois de 7 dias.</p>
        </FolhaCasca>
    )
}
