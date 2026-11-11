// src/app/(main)/painel-teste/AgoraConteudos.tsx — a parte de CONTEÚDOS DIGITAIS da página "Agora na sua loja" (laboratório /painel-teste, dados de EXEMPLO).
// Pensada para quem cria conteúdo: artistas, cantores, músicos, produtores musicais, cineastas e professores. O que importa para eles é
// quem está OUVINDO / ASSISTINDO agora, em que faixa ou minuto, de onde vêm e quem apoia. O seletor "Ver como" só existe no laboratório:
// mostra a mesma página para tipos de loja diferentes.
'use client'

import { ReactNode } from 'react'
import { Download, Eye, GraduationCap, Heart, Headphones, Music, Play, Radio, Share2, Film, Disc3, Crown, ListMusic } from 'lucide-react'
import type { ThemeColors } from '@/app/contexts/theme'

export type Tipo = 'pizzaria' | 'artista' | 'produtor' | 'cineasta'
export const TIPOS: { k: Tipo; nome: string; loja: string }[] = [
    { k: 'pizzaria', nome: 'Pizzaria', loja: 'Pizzaria Forno de Ouro' },
    { k: 'artista', nome: 'Cantora', loja: 'Duda Lima · música' },
    { k: 'produtor', nome: 'Produtor', loja: 'Beats & Samples' },
    { k: 'cineasta', nome: 'Cineasta', loja: 'Rua das Luzes · filmes' },
]
const ROXO = '#8b5cf6'

export interface EvBase { ic: ReactNode; cor: string; quem: string; txt: string }
interface Item { t: string; sub: string; n: number; prog: number; ic: ReactNode }
interface Dado { verbo: string; unidade: string; chips: [string, number, string][]; itens: Item[]; eventos: EvBase[]; cidades: [string, number][] }

const ic = (n: ReactNode) => n
export const CONTEUDOS: Record<Tipo, Dado> = {
    pizzaria: {
        verbo: 'nos seus conteúdos', unidade: 'pessoas',
        chips: [['Assistindo', 6, ROXO], ['Lendo', 3, '#3b82f6'], ['Baixando', 2, '#14b8a6'], ['Clube', 38, '#f59e0b']],
        itens: [
            { t: 'Curso Pizza Napolitana', sub: 'Aula 5 · Ponto da massa', n: 6, prog: 42, ic: ic(<GraduationCap size={18} />) },
            { t: 'E-book “Massa perfeita”', sub: 'página 18 de 48', n: 3, prog: 38, ic: ic(<Eye size={18} />) },
            { t: 'Receitas de molho (PDF grátis)', sub: 'baixando agora', n: 2, prog: 100, ic: ic(<Download size={18} />) },
        ],
        eventos: [
            { ic: <Play size={14} />, cor: ROXO, quem: '@carol-lima', txt: 'está assistindo a aula 5 do Curso Pizza Napolitana' },
            { ic: <Download size={14} />, cor: '#14b8a6', quem: 'Visitante', txt: 'baixou “Receitas de molho (PDF)” de graça' },
            { ic: <Crown size={14} />, cor: '#f59e0b', quem: '@heitor-martins', txt: 'entrou para o Clube da loja' },
        ],
        cidades: [['Porto Velho', 62], ['Manaus', 18], ['Rio Branco', 12], ['Outras', 8]],
    },
    artista: {
        verbo: 'ouvindo', unidade: 'ouvintes',
        chips: [['Ouvindo', 204, ROXO], ['Assistindo clipe', 22, '#ef4444'], ['Baixando', 9, '#14b8a6'], ['Apoiando', 3, '#f59e0b']],
        itens: [
            { t: 'Noite Vazia', sub: 'single · faixa 1 · 2:14 de 3:40', n: 128, prog: 60, ic: ic(<Music size={18} />) },
            { t: 'Maré Alta (álbum)', sub: 'faixas 2 a 9 · ordem do álbum', n: 76, prog: 25, ic: ic(<Disc3 size={18} />) },
            { t: 'Ao vivo no Teatro (clipe)', sub: 'vídeo · 1:50 de 4:10', n: 22, prog: 44, ic: ic(<Film size={18} />) },
            { t: 'Letra e cifra (PDF)', sub: 'baixando agora', n: 5, prog: 100, ic: ic(<Download size={18} />) },
        ],
        eventos: [
            { ic: <Headphones size={14} />, cor: ROXO, quem: '@bia-santos', txt: 'está ouvindo “Noite Vazia” (2:14)' },
            { ic: <ListMusic size={14} />, cor: '#3b82f6', quem: 'Visitante', txt: 'adicionou “Maré Alta” à biblioteca' },
            { ic: <Heart size={14} />, cor: '#f59e0b', quem: '@pedro-lima', txt: 'apoiou a artista com R$ 20,00' },
            { ic: <Share2 size={14} />, cor: '#16a34a', quem: '@marta-moura', txt: 'compartilhou “Noite Vazia” numa comunidade' },
            { ic: <Play size={14} />, cor: '#ef4444', quem: 'Visitante', txt: 'está assistindo o clipe “Ao vivo no Teatro”' },
            { ic: <Headphones size={14} />, cor: ROXO, quem: '@lucas-ferreira', txt: 'repetiu “Noite Vazia” pela 4ª vez' },
        ],
        cidades: [['Porto Velho', 38], ['Manaus', 24], ['Rio Branco', 14], ['São Paulo', 12], ['Outras', 12]],
    },
    produtor: {
        verbo: 'ouvindo prévias', unidade: 'pessoas',
        chips: [['Ouvindo prévia', 41, ROXO], ['Baixando', 17, '#14b8a6'], ['Comprando', 4, '#22c55e'], ['Licenciando', 2, '#f59e0b']],
        itens: [
            { t: 'Beat “Rua 12” (trap · 140 bpm)', sub: 'prévia de 30 s', n: 41, prog: 55, ic: ic(<Music size={18} />) },
            { t: 'Sample Pack Vol. 3 (WAV)', sub: 'baixando agora', n: 12, prog: 100, ic: ic(<Download size={18} />) },
            { t: 'Curso de mixagem', sub: 'aula 2 · compressão', n: 8, prog: 30, ic: ic(<GraduationCap size={18} />) },
            { t: 'Stems · Maré Alta', sub: 'prévia do pacote', n: 5, prog: 20, ic: ic(<Disc3 size={18} />) },
        ],
        eventos: [
            { ic: <Headphones size={14} />, cor: ROXO, quem: 'Visitante', txt: 'está ouvindo a prévia do beat “Rua 12”' },
            { ic: <Download size={14} />, cor: '#14b8a6', quem: '@rui-castro', txt: 'baixou o Sample Pack Vol. 3' },
            { ic: <Crown size={14} />, cor: '#f59e0b', quem: '@sara-melo', txt: 'pediu a licença exclusiva do beat “Rua 12”' },
            { ic: <Eye size={14} />, cor: '#3b82f6', quem: 'Visitante', txt: 'está vendo os preços de licença' },
        ],
        cidades: [['São Paulo', 34], ['Porto Velho', 22], ['Rio de Janeiro', 18], ['Manaus', 12], ['Outras', 14]],
    },
    cineasta: {
        verbo: 'assistindo', unidade: 'espectadores',
        chips: [['Assistindo', 87, ROXO], ['Trailer', 31, '#ef4444'], ['Alugando', 3, '#22c55e'], ['No clube', 12, '#f59e0b']],
        itens: [
            { t: 'Rua das Luzes (longa)', sub: 'minuto 38 de 92 · a maioria', n: 57, prog: 41, ic: ic(<Film size={18} />) },
            { t: 'Curta “Vizinhos”', sub: 'minuto 6 de 14', n: 19, prog: 43, ic: ic(<Film size={18} />) },
            { t: 'Trailer oficial', sub: 'prévia pública', n: 31, prog: 70, ic: ic(<Play size={18} />) },
            { t: 'Bastidores · ep. 2', sub: 'minuto 9 de 22', n: 11, prog: 40, ic: ic(<Eye size={18} />) },
        ],
        eventos: [
            { ic: <Play size={14} />, cor: ROXO, quem: '@ana-barbosa', txt: 'está assistindo “Rua das Luzes” (minuto 38)' },
            { ic: <Eye size={14} />, cor: '#3b82f6', quem: 'Visitante', txt: 'viu o trailer e abriu a página do filme' },
            { ic: <Crown size={14} />, cor: '#22c55e', quem: '@joao-martins', txt: 'alugou “Rua das Luzes” por 48 horas' },
            { ic: <Share2 size={14} />, cor: '#16a34a', quem: '@bia-santos', txt: 'compartilhou o trailer no Social' },
            { ic: <Heart size={14} />, cor: '#f59e0b', quem: '@marta-moura', txt: 'apoiou o diretor com R$ 10,00' },
        ],
        cidades: [['Porto Velho', 44], ['Manaus', 22], ['Cuiabá', 14], ['Brasília', 10], ['Outras', 10]],
    },
}

/** barrinhas de equalizador (só enfeite de "está tocando") */
export function Equalizador({ cor, h = 14, n = 4 }: { cor: string; h?: number; n?: number }) {
    return (
        <span className="inline-flex items-end gap-[2px]" style={{ height: h }} aria-hidden>
            <style>{`@keyframes labEq { 0%,100% { transform: scaleY(.25) } 50% { transform: scaleY(1) } } @media (prefers-reduced-motion: reduce) { .lab-eq { animation: none !important } }`}</style>
            {Array.from({ length: n }, (_, i) => <span key={i} className="lab-eq w-[3px] rounded-full" style={{ height: '100%', background: cor, transformOrigin: 'bottom', animation: `labEq ${0.7 + i * 0.17}s ease-in-out ${i * 0.11}s infinite` }} />)}
        </span>
    )
}

export default function Conteudos({ tipo, c, j, titulo }: { tipo: Tipo; c: ThemeColors; j: number; titulo?: boolean }) {
    const d = CONTEUDOS[tipo]
    const card = { background: c.surface, border: `1px solid ${c.border}` }
    const total = d.itens.reduce((t, i) => t + i.n, 0) + j
    return (
        <>
            {titulo !== false && <p className="text-[11px] font-black uppercase tracking-wider mt-5 mb-2 flex items-center gap-2" style={{ color: c.textSecondary }}><Radio size={13} style={{ color: ROXO }} />Conteúdos digitais agora</p>}
            <div className="rounded-3xl p-3.5 flex items-center gap-3" style={{ background: `${ROXO}12`, border: `1.5px solid ${ROXO}44` }}>
                <Equalizador cor={ROXO} h={34} n={5} />
                <div className="min-w-0"><p className="text-[26px] font-black leading-none">{total}</p><p className="text-[12px] font-bold mt-0.5" style={{ color: c.textSecondary }}>{d.unidade} {d.verbo} agora</p></div>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mt-2.5">
                {d.chips.map(([l, v, cor], i) => (
                    <div key={l} className="rounded-2xl py-2 text-center" style={card}><p className="text-[17px] font-black leading-none" style={{ color: cor }}>{v + (i === 0 ? j : 0)}</p><p className="text-[9.5px] font-bold mt-1 leading-tight px-0.5" style={{ color: c.textSecondary }}>{l}</p></div>
                ))}
            </div>

            <p className="text-[11px] font-black uppercase tracking-wider mt-5 mb-2" style={{ color: c.textSecondary }}>Tocando agora</p>
            <div className="rounded-3xl overflow-hidden" style={card}>
                {d.itens.map((it, i) => (
                    <div key={it.t} className="px-3.5 py-3" style={{ borderTop: i ? `1px solid ${c.border}` : undefined }}>
                        <div className="flex items-center gap-3">
                            <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${ROXO}22`, color: ROXO }}>{it.ic}</span>
                            <div className="min-w-0 flex-1"><p className="text-[13.5px] font-black leading-tight truncate">{it.t}</p><p className="text-[11.5px] leading-tight truncate mt-0.5" style={{ color: c.textSecondary }}>{it.sub}</p></div>
                            <div className="text-right flex-shrink-0"><p className="text-[15px] font-black leading-none flex items-center gap-1.5 justify-end">{it.prog < 100 && <Equalizador cor={ROXO} h={12} n={3} />}{it.n + (i === 0 ? j : 0)}</p><p className="text-[9.5px] font-bold mt-0.5" style={{ color: c.textSecondary }}>agora</p></div>
                        </div>
                        {it.prog < 100 && <span className="block h-1.5 rounded-full overflow-hidden mt-2.5" style={{ background: `${c.border}70` }}><span className="block h-full rounded-full" style={{ width: `${it.prog}%`, background: ROXO }} /></span>}
                    </div>
                ))}
            </div>
            <p className="text-[10.5px] mt-1.5 px-1" style={{ color: c.textSecondary }}>A barrinha é até onde a maioria chegou (faixa, aula ou minuto do vídeo).</p>

            <p className="text-[11px] font-black uppercase tracking-wider mt-5 mb-2" style={{ color: c.textSecondary }}>De onde estão {tipo === 'cineasta' ? 'assistindo' : 'ouvindo'}</p>
            <div className="rounded-3xl p-3.5 space-y-2.5" style={card}>
                {d.cidades.map(([l, p]) => (
                    <div key={l}><div className="flex justify-between text-[12px] font-bold mb-1"><span>{l}</span><span>{p}%</span></div><span className="block h-2 rounded-full overflow-hidden" style={{ background: `${c.border}70` }}><span className="block h-full rounded-full" style={{ width: `${p}%`, background: ROXO }} /></span></div>
                ))}
            </div>
        </>
    )
}
