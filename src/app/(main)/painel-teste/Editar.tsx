// src/app/(main)/painel-teste/Editar.tsx — a página "Editar loja" do laboratório do painel (só teste, dados de exemplo).
// É a CENTRAL de tudo que se configura, agrupada pelo que a pessoa quer fazer (sobre a loja, vender, receber, atender, divulgar), com o ESTADO de
// cada item na linha. Tocar abre o destino (folha ou página) já desenhado em Destinos.tsx. No fim, a zona de perigo (pausar e excluir).
'use client'

import { ReactNode, useState } from 'react'
import { ChevronRight, Crown, Eye, EyeOff, Share2, Store, Trash2 } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { C } from './dados'
import { FolhaCasca, PaginaCasca, Switch, useAviso } from './labui'

export interface ItemEdicao { k: string; t: string; ic: ReactNode; cor: string; texto: string; estado: 'on' | 'off' | 'warn' }

const GRUPOS: { titulo: string; dica: string; ks: string[] }[] = [
    { titulo: 'Sobre a loja', dica: 'Como a loja aparece para o cliente', ks: ['inf'] },
    { titulo: 'O que você vende', dica: 'Produtos, serviços e ofertas', ks: ['cat', 'srv', 'pro'] },
    { titulo: 'Como você recebe', dica: 'Pagamento e entrega', ks: ['pag', 'ent'] },
    { titulo: 'Quando e quem atende', dica: 'Horários, agenda e equipe', ks: ['hor', 'age', 'eqp'] },
    { titulo: 'Divulgação', dica: 'Publicações, clube e avisos', ks: ['pub', 'clu', 'zap'] },
]
const SELO = { on: '#16a34a', off: '#9ca3af', warn: '#ef4444' }

export default function Editar({ itens, onAbrir, onCompartilhar, onClose }: { itens: ItemEdicao[]; onAbrir: (k: string) => void; onCompartilhar: () => void; onClose: () => void }) {
    const { colors } = useTheme()
    const card = { background: colors.surface, border: `1px solid ${colors.border}` }
    const [pausada, setPausada] = useState(false)
    const [excluir, setExcluir] = useState(false)
    const [confirma, setConfirma] = useState('')
    const { mostrar, node } = useAviso()
    const faltam = itens.filter((i) => i.estado === 'warn').length

    return (
        <PaginaCasca titulo="Editar loja" sub="Tudo que você configura, num lugar só" cor="#f97316" icone={<Store size={18} />} onClose={onClose}>
            {node}
            <div className="rounded-3xl p-3.5" style={card}>
                <div className="flex items-center gap-3">
                    <span className="w-14 h-14 rounded-2xl flex items-center justify-center text-white flex-shrink-0" style={{ background: '#b91c1c', boxShadow: '0 0 0 3px #fbbf24' }}><Store size={24} /></span>
                    <div className="min-w-0 flex-1"><p className="text-[16px] font-black leading-tight truncate">Pizzaria Forno de Ouro</p><p className="text-[11.5px] truncate" style={{ color: colors.textSecondary }}>iuser.com.br/pizzaria-forno-de-ouro</p>
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-black mt-1 px-2 py-0.5 rounded-full" style={{ background: '#fbbf2433', color: '#92400e' }}><Crown size={11} />Nível 4 · Lenda</span></div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                    <button onClick={() => mostrar('Abrindo a loja como o cliente vê (exemplo)')} className="h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5" style={{ border: `1px solid ${colors.border}` }}><Eye size={14} />Ver como cliente</button>
                    <button onClick={onCompartilhar} className="h-10 rounded-full text-[12.5px] font-black flex items-center justify-center gap-1.5 text-white" style={{ background: '#f97316' }}><Share2 size={14} />Compartilhar</button>
                </div>
            </div>
            {faltam > 0 && <div className="rounded-2xl p-3 mt-3 text-[12px] font-semibold leading-snug" style={{ background: '#ef444412', border: '1px solid #ef444455' }}><b style={{ color: '#ef4444' }}>{faltam} {faltam === 1 ? 'coisa precisa' : 'coisas precisam'} de atenção</b> — estão marcadas em vermelho abaixo.</div>}

            {GRUPOS.map((g) => {
                const linhas = g.ks.map((k) => itens.find((i) => i.k === k)).filter(Boolean) as ItemEdicao[]
                if (linhas.length === 0) return null
                return (
                    <div key={g.titulo} className="mt-5">
                        <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>{g.titulo}</p>
                        <p className="text-[11px] mb-1.5" style={{ color: colors.textSecondary }}>{g.dica}</p>
                        <div className="rounded-3xl overflow-hidden" style={card}>
                            {linhas.map((i, n) => (
                                <button key={i.k} onClick={() => onAbrir(i.k)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:opacity-70" style={{ borderTop: n ? `1px solid ${colors.border}` : undefined }}>
                                    <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: i.estado === 'off' ? `${colors.border}70` : `${i.estado === 'warn' ? '#ef4444' : i.cor}26`, color: i.estado === 'off' ? colors.textSecondary : i.estado === 'warn' ? '#ef4444' : i.cor }}>{i.ic}</span>
                                    <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-black leading-tight">{i.t}</span><span className="block text-[11.5px] font-semibold leading-tight mt-0.5" style={{ color: i.estado === 'warn' ? '#ef4444' : colors.textSecondary }}>{i.texto}</span></span>
                                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: SELO[i.estado] }} /><ChevronRight size={16} style={{ color: colors.textSecondary }} />
                                </button>
                            ))}
                        </div>
                    </div>
                )
            })}

            <div className="mt-5">
                <p className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: colors.textSecondary }}>Mais</p>
                <div className="rounded-3xl overflow-hidden" style={card}>
                    <div className="flex items-center gap-3 px-3.5 py-3"><span className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `${colors.border}70`, color: colors.textSecondary }}><EyeOff size={19} /></span><span className="flex-1"><span className="block text-[13.5px] font-black">Pausar a loja</span><span className="block text-[11.5px]" style={{ color: colors.textSecondary }}>Some das listas e não recebe pedidos; nada é apagado.</span></span><Switch on={pausada} set={(v) => { setPausada(v); mostrar(v ? 'Loja pausada' : 'Loja voltou ao ar') }} /></div>
                    <button onClick={() => setExcluir(true)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left" style={{ borderTop: `1px solid ${colors.border}` }}><span className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: '#ef444422', color: '#ef4444' }}><Trash2 size={19} /></span><span className="flex-1"><span className="block text-[13.5px] font-black" style={{ color: '#ef4444' }}>Excluir a loja</span><span className="block text-[11.5px]" style={{ color: colors.textSecondary }}>Apaga a loja, o catálogo e o histórico. Não tem volta.</span></span></button>
                </div>
            </div>

            {excluir && (
                <FolhaCasca titulo="Excluir a loja?" cor="#ef4444" icone={<Trash2 size={20} />} onClose={() => { setExcluir(false); setConfirma('') }}
                    rodape={<button disabled={confirma.trim().toLowerCase() !== 'excluir'} onClick={() => { setExcluir(false); setConfirma(''); mostrar('Exemplo: a loja NÃO foi excluída') }} className="w-full h-12 rounded-full text-[14px] font-black text-white disabled:opacity-40" style={{ background: '#ef4444' }}>Excluir para sempre</button>}>
                    <p className="text-[13px] leading-snug">Isso apaga a <b>Pizzaria Forno de Ouro</b>, os 33 produtos, as 120 avaliações e os pedidos. Pedidos em andamento serão cancelados e os clientes avisados.</p>
                    <p className="text-[12px] font-bold mt-3 mb-1.5">Para confirmar, escreva <b>excluir</b>:</p>
                    <input value={confirma} onChange={(e) => setConfirma(e.target.value)} className="w-full h-12 rounded-2xl px-4 text-[14px] outline-none" style={{ background: colors.surface, border: `1.5px solid ${colors.border}`, color: colors.textPrimary }} />
                    <p className="text-[11.5px] mt-2" style={{ color: colors.textSecondary }}>Prefere só dar um tempo? Use “Pausar a loja”.</p>
                </FolhaCasca>
            )}
        </PaginaCasca>
    )
}
void C
