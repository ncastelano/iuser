'use client'

// "AGORA NA SUA LOJA" (painel da loja da 3.0; abre pelo "Online agora" de "Como está o dia"), no desenho do laboratório /painel-teste, com a
// PRESENÇA de verdade (tempo real, modules/store-presence): quantas pessoas, em que etapa (vendo a loja, no catálogo, num item, com sacola,
// pagando), o que mais estão vendo e um feed ao vivo — tudo ANÔNIMO ("Alguém está vendo …"). Para lojas de conteúdo, quem está ouvindo,
// assistindo ou lendo agora. Nada de nome, @, foto ou cidade sai do aparelho de quem visita.
import { useEffect, useState } from 'react'
import { Activity, Eye, Headphones, Radio } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { frase, resumir, STAGE_INFO, STAGES, useStorePresence } from '@/modules/store-presence'
import { PaginaPainel } from './Casca'

const ago = (t: number, now: number) => { const s = Math.max(0, Math.round((now - t) / 1000)); return s < 60 ? 'agora' : s < 3600 ? `há ${Math.round(s / 60)} min` : `há ${Math.round(s / 3600)} h` }

type Presenca = ReturnType<typeof useStorePresence>

/** o painel ouve o canal UMA vez (useStorePresence) e passa para cá: dois canais com o mesmo nome no mesmo cliente se atrapalham */
export default function AgoraNaLoja({ storeName, presenca, onClose }: { storeName: string; presenca: Presenca; onClose: () => void }) {
    const { colors: c } = useTheme()
    const card = { background: c.surface, border: `1px solid ${c.border}` }
    const { rows, feed } = presenca
    const [now, setNow] = useState(Date.now())
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t) }, [])
    const r = resumir(rows || [])
    const conteudo = STAGES.filter((s) => STAGE_INFO[s].conteudo)
    const compra = STAGES.filter((s) => !STAGE_INFO[s].conteudo)

    return (
        <PaginaPainel titulo="Agora na sua loja" sub={storeName} cor="#16a34a" icone={<Activity size={18} />} onClose={onClose}>
            <style>{`@keyframes agoraPulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.6); opacity: .35 } } @keyframes eq { 0%,100% { height: 30% } 50% { height: 100% } } @media (prefers-reduced-motion: reduce) { .agora-anim { animation: none !important } }`}</style>
            <div className="rounded-3xl p-4" style={card}>
                <div className="flex items-center gap-2">
                    <span className="relative w-3 h-3"><span className="agora-anim absolute inset-0 rounded-full" style={{ background: '#22c55e', animation: 'agoraPulse 1.6s ease-in-out infinite' }} /><span className="absolute inset-0.5 rounded-full" style={{ background: '#16a34a' }} /></span>
                    <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: '#16a34a' }}>Ao vivo</span>
                </div>
                <p className="text-[40px] font-black leading-none mt-2">{rows === null ? '…' : r.total}</p>
                <p className="text-[12.5px]" style={{ color: c.textSecondary }}>{r.total === 1 ? 'pessoa na loja agora' : 'pessoas na loja agora'}</p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                    {compra.map((s) => (
                        <span key={s} className="h-7 px-2.5 rounded-full text-[11.5px] font-black flex items-center gap-1" style={{ background: `${STAGE_INFO[s].cor}1c`, color: STAGE_INFO[s].cor, opacity: r.porEtapa[s] ? 1 : 0.45 }}>
                            {r.porEtapa[s]} · {STAGE_INFO[s].nome.toLowerCase()}
                        </span>
                    ))}
                </div>
            </div>

            {r.conteudoAgora > 0 && (
                <div className="rounded-3xl p-4 mt-3" style={{ ...card, borderColor: '#a855f766' }}>
                    <div className="flex items-center gap-2">
                        <span className="flex items-end gap-0.5 h-5">{[0, 1, 2, 3].map((i) => <span key={i} className="agora-anim w-1 rounded-sm" style={{ background: '#a855f7', animation: `eq ${0.7 + i * 0.15}s ease-in-out infinite` }} />)}</span>
                        <p className="text-[14px] font-black">{r.conteudoAgora} {r.conteudoAgora === 1 ? 'pessoa' : 'pessoas'} com seus conteúdos agora</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {conteudo.filter((s) => r.porEtapa[s]).map((s) => <span key={s} className="h-7 px-2.5 rounded-full text-[11.5px] font-black flex items-center" style={{ background: `${STAGE_INFO[s].cor}1c`, color: STAGE_INFO[s].cor }}>{r.porEtapa[s]} · {STAGE_INFO[s].nome.toLowerCase()}</span>)}
                    </div>
                </div>
            )}

            {r.maisVistos.length > 0 && (
                <>
                    <p className="text-[11px] font-black uppercase tracking-wider mt-5 mb-1.5 flex items-center gap-1" style={{ color: c.textSecondary }}><Eye size={12} />Mais vistos agora</p>
                    <div className="rounded-3xl overflow-hidden" style={card}>
                        {r.maisVistos.map((m, i) => (
                            <div key={m.label} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderTop: i ? `1px solid ${c.border}` : undefined }}>
                                <span className="w-6 text-[13px] font-black" style={{ color: c.textSecondary }}>{i + 1}</span>
                                <span className="flex-1 min-w-0 text-[13px] font-black truncate">{m.label}</span>
                                <span className="text-[12px] font-black" style={{ color: '#16a34a' }}>{m.n} agora</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <p className="text-[11px] font-black uppercase tracking-wider mt-5 mb-1.5 flex items-center gap-1" style={{ color: c.textSecondary }}><Radio size={12} />Acontecendo agora</p>
            <div className="rounded-3xl overflow-hidden" style={card}>
                {feed.length === 0 && (rows || []).length === 0 && <p className="text-[12.5px] text-center py-6 px-4" style={{ color: c.textSecondary }}>Ninguém na loja neste momento. Quando alguém abrir a loja, o catálogo ou um conteúdo seu, aparece aqui na hora.</p>}
                {[...feed.map((f) => ({ ...f, k: f.id })), ...(feed.length ? [] : (rows || []).map((x) => ({ ...x, k: x.key, saiu: false })))].slice(0, 25).map((f, i) => (
                    <div key={f.k} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderTop: i ? `1px solid ${c.border}` : undefined, opacity: f.saiu ? 0.55 : 1 }}>
                        <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${STAGE_INFO[f.stage].cor}22`, color: STAGE_INFO[f.stage].cor }}>{STAGE_INFO[f.stage].conteudo ? <Headphones size={15} /> : <Eye size={15} />}</span>
                        <span className="flex-1 min-w-0 text-[12.5px] leading-snug">{f.saiu ? 'Alguém saiu da loja' : frase(f)}</span>
                        <span className="text-[10.5px] font-bold flex-shrink-0" style={{ color: c.textSecondary }}>{ago(f.at, now)}</span>
                    </div>
                ))}
            </div>
            <p className="text-[11px] leading-snug mt-3" style={{ color: c.textSecondary }}>Ninguém é identificado: o iUser só conta quem está em cada parte da loja e o nome do item aberto. Quem não está logado conta igual.</p>
        </PaginaPainel>
    )
}
