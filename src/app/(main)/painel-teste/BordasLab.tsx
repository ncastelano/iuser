// src/app/(main)/painel-teste/BordasLab.tsx
//
// LABORATÓRIO DAS BORDAS DE LOJA (/painel-teste?lab=bordas; só teste, dados de exemplo, nada grava). Proposta: a loja ganha um NÍVEL conforme os
// pontos que ela tem no Outdoor, e o nível decide a moldura do logo. A moldura da loja é um QUADRADO arredondado (as lojas já são quadradas nas
// listas e no mapa) com cores PRÓPRIAS — o perfil continua com o anel REDONDO de metal (Bronze, Prata, Ouro, Diamante) — para nunca confundir
// uma loja com uma pessoa. Os nomes, as cores e os pontos de cada nível são só uma proposta.
'use client'

import { ReactNode, useState } from 'react'
import { ArrowUp, Check, Crown, Star, Store } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'

interface Nivel { n: number; nome: string; min: number; cores: string[]; como: string; animada?: boolean }

const NIVEIS: Nivel[] = [
    { n: 0, nome: 'Iniciante', min: 0, cores: [], como: 'Sem moldura: o logo limpo.' },
    { n: 1, nome: 'Ativa', min: 100, cores: ['#22c55e'], como: 'Fio verde, uma cor só.' },
    { n: 2, nome: 'Destaque', min: 500, cores: ['#38bdf8', '#3b82f6', '#6366f1'], como: 'Degradê azul-violeta.' },
    { n: 3, nome: 'Estrela', min: 1500, cores: ['#a855f7', '#ec4899', '#f472b6'], como: 'Degradê rosa e anel duplo com brilho.' },
    { n: 4, nome: 'Lenda', min: 4000, cores: ['#f97316', '#ef4444', '#fbbf24', '#f97316'], como: 'Chama laranja que gira devagar e a coroa.', animada: true },
]
const nivelDe = (pts: number) => [...NIVEIS].reverse().find((n) => pts >= n.min) ?? NIVEIS[0]

/** A moldura do logo da loja. `size` = lado do quadrado (px). Sempre quadrado arredondado, nunca redondo. */
function Moldura({ nivel, size, logo, bg }: { nivel: Nivel; size: number; logo: ReactNode; bg: string }) {
    const radius = Math.round(size * 0.26)
    const ring = nivel.n === 0 ? 0 : Math.max(2, Math.round(size * (nivel.n >= 4 ? 0.07 : 0.055)))
    const inner = size - ring * 2
    const grad = nivel.cores.length > 1 ? `linear-gradient(135deg, ${nivel.cores.join(', ')})` : nivel.cores[0]
    const glow = nivel.n === 3 ? `0 0 0 ${Math.max(2, Math.round(size * 0.04))}px ${bg}, 0 0 0 ${Math.max(3, Math.round(size * 0.07))}px ${nivel.cores[0]}55, 0 6px 18px ${nivel.cores[1]}66`
        : nivel.n === 4 ? `0 6px 20px ${nivel.cores[0]}66` : nivel.n === 2 ? `0 4px 12px ${nivel.cores[1]}44` : undefined
    return (
        <span className="relative inline-block flex-shrink-0" style={{ width: size, height: size }}>
            <span className="absolute inset-0 overflow-hidden" style={{ borderRadius: radius, background: nivel.animada ? undefined : grad, boxShadow: glow }}>
                {nivel.animada && (
                    <span className="absolute motion-reduce:animate-none" style={{ inset: '-60%', background: `conic-gradient(${nivel.cores.join(', ')})`, animation: 'bordaGira 5s linear infinite' }} />
                )}
            </span>
            <span className="absolute flex items-center justify-center overflow-hidden text-white" style={{ inset: ring, width: inner, height: inner, borderRadius: Math.max(4, radius - ring), background: '#b91c1c' }}>{logo}</span>
            {nivel.n === 4 && size >= 40 && (
                <span className="absolute flex items-center justify-center rounded-full" style={{ right: -size * 0.08, top: -size * 0.1, width: size * 0.34, height: size * 0.34, background: '#fbbf24', color: '#7c2d12', boxShadow: `0 0 0 2px ${bg}` }}><Crown size={Math.round(size * 0.2)} /></span>
            )}
        </span>
    )
}

/** Para comparar: o anel REDONDO de metal que o PERFIL já tem hoje */
function AnelPerfil({ size, cores, bg }: { size: number; cores: string[]; bg: string }) {
    return (
        <span className="relative inline-flex rounded-full flex-shrink-0" style={{ width: size, height: size, padding: Math.max(2, size * 0.06), background: `conic-gradient(${cores.join(', ')})` }}>
            <span className="rounded-full w-full h-full flex items-center justify-center font-black text-white" style={{ background: '#475569', boxShadow: `0 0 0 2px ${bg}`, fontSize: size * 0.34 }}>AS</span>
        </span>
    )
}

export default function BordasLab() {
    const { colors } = useTheme()
    const [pts, setPts] = useState(1800)
    const nivel = nivelDe(pts)
    const prox = NIVEIS[nivel.n + 1]
    const logo = <Store size={20} />
    const card = { background: colors.surface, border: `1px solid ${colors.border}` }
    const ORANGE = '#f97316'

    return (
        <div className="min-h-[100dvh] flex justify-center" style={{ background: colors.surface, color: colors.textPrimary }}>
            <style>{`@keyframes bordaGira { to { transform: rotate(360deg) } }`}</style>
            <div className="w-full max-w-md min-h-[100dvh] px-4 pt-[calc(14px+env(safe-area-inset-top))] pb-16" style={{ background: colors.background, boxShadow: '0 0 0 1px ' + colors.border }}>
                <p className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>Laboratório · só teste</p>
                <h1 className="text-[20px] font-black leading-tight mt-0.5">Níveis e bordas da loja</h1>
                <p className="text-[12.5px] mt-1 leading-snug" style={{ color: colors.textSecondary }}>O nível vem dos pontos da loja no Outdoor (vendas, avaliações, missões…). O nível decide a moldura do logo, em todo lugar onde a loja aparece.</p>

                {/* ===== o seletor de pontos ===== */}
                <div className="mt-4 rounded-3xl p-4" style={card}>
                    <div className="flex items-center gap-3">
                        <Moldura nivel={nivel} size={72} logo={<Store size={30} />} bg={colors.surface} />
                        <div className="min-w-0">
                            <p className="text-[17px] font-black leading-tight">Pizzaria Forno de Ouro</p>
                            <p className="text-[12px] font-bold mt-0.5" style={{ color: nivel.cores[0] ?? colors.textSecondary }}>Nível {nivel.n} · {nivel.nome}</p>
                            <p className="text-[11.5px]" style={{ color: colors.textSecondary }}>{pts.toLocaleString('pt-BR')} pontos no Outdoor</p>
                        </div>
                    </div>
                    <input type="range" min={0} max={6000} step={50} value={pts} onChange={(e) => setPts(Number(e.target.value))} className="w-full mt-4" style={{ accentColor: ORANGE }} aria-label="Pontos da loja" />
                    <div className="flex justify-between text-[10.5px] font-bold" style={{ color: colors.textSecondary }}><span>0</span><span>6.000 pontos</span></div>
                    <p className="text-[12px] font-semibold mt-2 flex items-center gap-1.5" style={{ color: colors.textSecondary }}>
                        {prox ? <><ArrowUp size={13} style={{ color: ORANGE }} />Faltam <b style={{ color: colors.textPrimary }}>{(prox.min - pts).toLocaleString('pt-BR')} pontos</b> para {prox.nome}</> : <><Check size={13} style={{ color: '#16a34a' }} />Nível máximo</>}
                    </p>
                </div>

                {/* ===== onde a moldura aparece ===== */}
                <p className="text-[11px] font-black uppercase tracking-wider mt-5 mb-2" style={{ color: colors.textSecondary }}>Onde ela aparece</p>
                <div className="rounded-3xl overflow-hidden" style={card}>
                    <div className="flex items-center gap-3 px-3.5 py-3">
                        <Moldura nivel={nivel} size={44} logo={logo} bg={colors.surface} />
                        <div className="min-w-0 flex-1"><p className="text-[13.5px] font-black leading-tight">Pizzaria Forno de Ouro</p><p className="text-[11.5px] flex items-center gap-1" style={{ color: colors.textSecondary }}><Star size={11} fill="#eab308" style={{ color: '#eab308' }} />4,6 · Pizzaria · aberta</p></div>
                        <span className="text-[10.5px] font-bold" style={{ color: colors.textSecondary }}>lista de lojas</span>
                    </div>
                    <div className="flex items-center gap-3 px-3.5 py-3" style={{ borderTop: `1px solid ${colors.border}` }}>
                        <Moldura nivel={nivel} size={52} logo={logo} bg={colors.surface} />
                        <div className="min-w-0 flex-1"><p className="text-[13.5px] font-black leading-tight">1º · Pizzaria Forno de Ouro</p><p className="text-[11.5px]" style={{ color: colors.textSecondary }}>{pts.toLocaleString('pt-BR')} pts</p></div>
                        <span className="text-[10.5px] font-bold" style={{ color: colors.textSecondary }}>Outdoor</span>
                    </div>
                    <div className="flex items-center gap-3 px-3.5 py-3" style={{ borderTop: `1px solid ${colors.border}`, background: '#dbeafe66' }}>
                        <Moldura nivel={nivel} size={32} logo={<Store size={14} />} bg="#dbeafe" />
                        <p className="text-[12px] font-semibold flex-1" style={{ color: '#1e3a8a' }}>marcador no mapa (Radar): pequeno, só a moldura e o logo</p>
                    </div>
                </div>

                {/* ===== a escada ===== */}
                <p className="text-[11px] font-black uppercase tracking-wider mt-5 mb-2" style={{ color: colors.textSecondary }}>Os 5 níveis</p>
                <div className="space-y-2">
                    {NIVEIS.map((n) => (
                        <button key={n.n} onClick={() => setPts(Math.max(n.min, 0))} className="w-full flex items-center gap-3 rounded-3xl p-3 text-left active:scale-[.99] transition" style={{ ...card, borderColor: nivel.n === n.n ? ORANGE : colors.border, borderWidth: nivel.n === n.n ? 2 : 1 }}>
                            <Moldura nivel={n} size={56} logo={<Store size={22} />} bg={colors.surface} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-[14px] font-black leading-tight">{n.n}. {n.nome}</span>
                                <span className="block text-[11.5px] leading-snug" style={{ color: colors.textSecondary }}>{n.como}</span>
                            </span>
                            <span className="text-[11.5px] font-black whitespace-nowrap" style={{ color: ORANGE }}>{n.min === 0 ? 'começa aqui' : `${n.min.toLocaleString('pt-BR')}+ pts`}</span>
                        </button>
                    ))}
                </div>

                {/* ===== loja × perfil ===== */}
                <p className="text-[11px] font-black uppercase tracking-wider mt-5 mb-2" style={{ color: colors.textSecondary }}>Loja × perfil: nunca se confundem</p>
                <div className="rounded-3xl p-4 flex items-center justify-around" style={card}>
                    <div className="text-center"><AnelPerfil size={64} bg={colors.surface} cores={['#f5c518', '#fff1a8', '#d99a00', '#fff1a8', '#f5c518']} /><p className="text-[11.5px] font-black mt-2">Perfil</p><p className="text-[10.5px]" style={{ color: colors.textSecondary }}>redondo · metal</p></div>
                    <div className="text-center"><Moldura nivel={NIVEIS[3]} size={64} logo={<Store size={26} />} bg={colors.surface} /><p className="text-[11.5px] font-black mt-2">Loja</p><p className="text-[10.5px]" style={{ color: colors.textSecondary }}>quadrada · cores próprias</p></div>
                </div>

                <p className="text-[11.5px] leading-snug mt-4" style={{ color: colors.textSecondary }}>
                    Regras sugeridas: o nível acompanha os pontos do Outdoor de lojas; <b>desce só um degrau por vez</b> e só depois de 7 dias abaixo da linha (a loja não perde a moldura por uma semana ruim); os pontos de cada nível são editados pelo admin; loja bloqueada ou inativa perde a moldura.
                </p>
            </div>
        </div>
    )
}
