// src/app/(main)/painel-teste/Compartilhar.tsx — a folha COMPARTILHAR A LOJA do laboratório do painel (só teste, dados de exemplo, nada envia).
// Duas partes, como o diálogo do app: DENTRO DO iUSER (últimos lugares, comunidades, conversas, pessoas e o próprio perfil) e PARA FORA
// (WhatsApp, Facebook, Instagram, X, TikTok, copiar o link e as opções do aparelho). Instagram e TikTok não aceitam link por endereço: o
// app copia e abre o aplicativo para colar (já é assim no Instagram do app de verdade). TikTok é NOVO: o diálogo real ainda não tem.
'use client'

import { ReactNode, useState } from 'react'
import { Check, Copy, MessageCircle, MoreHorizontal, Search, Send, Share2, User, Users } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { C, ORANGE } from './dados'
import { FolhaCasca, useAviso } from './labui'

const WHATSAPP = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z'
const FACEBOOK = 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z'
const XPATH = 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z'
const TIKTOK = 'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'
const Brand = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="24" height="24" fill="#fff" aria-hidden><path d={d} /></svg>
const Insta = () => <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="#fff" stroke="none" /></svg>

const LINK = 'iuser.com.br/pizzaria-forno-de-ouro'
const COMUNIDADES = [['Pizzaiolos de Porto Velho', '1,2 mil membros'], ['Comida de Rondônia', '3,4 mil membros'], ['Empreendedores RO', '860 membros'], ['Bairro Centro', '2,1 mil membros']]
const CONVERSAS = [['Helena Prado', 'cliente'], ['Gabriela Carvalho', 'cliente'], ['Dani · entregadora', 'equipe'], ['Grupo da equipe', 'grupo']]
const PESSOAS = ['@ana-silva', '@felipe-costa', '@helena-prado', '@gabriela-carvalho', '@marta-moura', '@breno-oliveira']

export default function Compartilhar({ onClose }: { onClose: () => void }) {
    const { colors } = useTheme()
    const card = { background: colors.surface, border: `1px solid ${colors.border}` }
    const [painel, setPainel] = useState<'com' | 'conv' | 'pes' | null>(null)
    const [enviados, setEnviados] = useState<Record<string, boolean>>({})
    const [busca, setBusca] = useState('')
    const [copiado, setCopiado] = useState(false)
    const [msg, setMsg] = useState('Peça pizza de forno a lenha na Pizzaria Forno de Ouro 🍕 Cardápio, rodízio e agenda no iUser:')
    const { mostrar, node } = useAviso()
    const enviar = (id: string, nome: string) => { setEnviados((e) => ({ ...e, [id]: true })); mostrar(`Enviado para ${nome}!`) }
    const Linha = ({ id, nome, sub }: { id: string; nome: string; sub?: string }) => (
        <div className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="w-9 h-9 rounded-full flex items-center justify-center font-black text-white flex-shrink-0" style={{ background: ORANGE }}>{nome.replace('@', '')[0].toUpperCase()}</span>
            <span className="min-w-0 flex-1"><span className="block text-[13px] font-black truncate">{nome}</span>{sub && <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{sub}</span>}</span>
            <button disabled={enviados[id]} onClick={() => enviar(id, nome)} className="h-9 px-4 rounded-full text-[12px] font-black active:scale-95" style={enviados[id] ? { background: `${C.novo}22`, color: '#16a34a' } : { background: ORANGE, color: '#fff' }}>{enviados[id] ? '✓ Enviado' : 'Enviar'}</button>
        </div>
    )
    const externo: { id: string; nome: string; bg: string; icone: ReactNode; aviso: string }[] = [
        { id: 'wa', nome: 'WhatsApp', bg: '#25D366', icone: <Brand d={WHATSAPP} />, aviso: 'Abrindo o WhatsApp com a mensagem pronta…' },
        { id: 'fb', nome: 'Facebook', bg: '#1877F2', icone: <Brand d={FACEBOOK} />, aviso: 'Abrindo o compartilhar do Facebook…' },
        { id: 'ig', nome: 'Instagram', bg: 'linear-gradient(45deg,#f09433,#e6683c 30%,#dc2743 55%,#cc2366 75%,#bc1888)', icone: <Insta />, aviso: 'Link copiado! Cole no Direct, nos stories ou na bio do Instagram.' },
        { id: 'x', nome: 'X', bg: '#000', icone: <Brand d={XPATH} />, aviso: 'Abrindo o X com o texto e o link…' },
        { id: 'tt', nome: 'TikTok', bg: 'linear-gradient(135deg,#010101,#25f4ee 140%)', icone: <Brand d={TIKTOK} />, aviso: 'Link copiado! Cole na descrição ou na bio do TikTok.' },
    ]

    return (
        <FolhaCasca titulo="Compartilhar a loja" sub="Pizzaria Forno de Ouro" cor={ORANGE} icone={<Share2 size={20} />} onClose={onClose}>
            {node}
            <div className="rounded-3xl p-3 flex items-center gap-3" style={card}>
                <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white flex-shrink-0" style={{ background: '#b91c1c', boxShadow: '0 0 0 3px #fbbf24' }}>🍕</span>
                <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-black truncate">Pizzaria Forno de Ouro</span><span className="block text-[11.5px] truncate" style={{ color: colors.textSecondary }}>{LINK}</span></span>
                <button onClick={() => { setCopiado(true); mostrar('Link copiado!'); setTimeout(() => setCopiado(false), 2200) }} className="h-9 px-3 rounded-full text-[12px] font-black flex items-center gap-1.5" style={{ border: `1px solid ${colors.border}` }}>{copiado ? <Check size={14} style={{ color: '#16a34a' }} /> : <Copy size={14} />}{copiado ? 'Copiado' : 'Copiar'}</button>
            </div>

            <p className="text-[11px] font-black uppercase tracking-wider mt-5 mb-2" style={{ color: ORANGE }}>Dentro do iUser</p>
            <p className="text-[11px] font-bold mb-1.5" style={{ color: colors.textSecondary }}>Últimos lugares</p>
            <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {[['Helena', 'h'], ['Pizzaiolos PVH', 'c'], ['Gabriela', 'g'], ['Equipe', 'e']].map(([n, id]) => (
                    <button key={id} onClick={() => enviar('u' + id, n)} className="flex flex-col items-center gap-1 flex-shrink-0 w-[62px] active:scale-95">
                        <span className="relative w-12 h-12 rounded-full flex items-center justify-center font-black text-white" style={{ background: id === 'c' ? C.caminho : ORANGE }}>{n[0]}{enviados['u' + id] && <span className="absolute -right-0.5 -bottom-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: '#16a34a', boxShadow: `0 0 0 2px ${colors.background}` }}><Check size={11} /></span>}</span>
                        <span className="text-[10.5px] font-bold truncate w-full text-center">{n}</span>
                    </button>
                ))}
            </div>
            <div className="grid grid-cols-4 gap-2 mt-3">
                {([['com', 'Comunidades', <Users key="a" size={19} />], ['conv', 'Conversas', <MessageCircle key="b" size={19} />], ['pes', 'Pessoas', <Search key="c" size={19} />]] as const).map(([k, l, ic]) => (
                    <button key={k} onClick={() => setPainel(painel === k ? null : k)} className="rounded-2xl py-3 flex flex-col items-center gap-1 text-[11px] font-black active:scale-95" style={painel === k ? { background: `${ORANGE}1a`, border: `2px solid ${ORANGE}`, color: ORANGE } : card}>{ic}{l}</button>
                ))}
                <button onClick={() => { setEnviados((e) => ({ ...e, perfil: true })); mostrar('Publicado no seu perfil!') }} className="rounded-2xl py-3 flex flex-col items-center gap-1 text-[11px] font-black active:scale-95" style={enviados.perfil ? { background: `${C.novo}22`, border: `2px solid ${C.novo}`, color: '#16a34a' } : card}>{enviados.perfil ? <Check size={19} /> : <User size={19} />}Meu perfil</button>
            </div>
            {painel && (
                <div className="rounded-3xl overflow-hidden mt-2" style={card}>
                    {painel === 'pes' && <div className="px-3.5 pt-3 pb-1"><div className="h-10 rounded-full px-3.5 flex items-center gap-2" style={{ background: colors.background, border: `1.5px solid ${colors.border}` }}><Search size={14} style={{ color: colors.textSecondary }} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou @" className="flex-1 bg-transparent outline-none text-[13px]" style={{ color: colors.textPrimary }} /></div></div>}
                    {painel === 'com' && COMUNIDADES.map(([n, s]) => <Linha key={n} id={'com' + n} nome={n} sub={s} />)}
                    {painel === 'conv' && CONVERSAS.map(([n, s]) => <Linha key={n} id={'cv' + n} nome={n} sub={s} />)}
                    {painel === 'pes' && PESSOAS.filter((p) => p.includes(busca.trim().toLowerCase().replace('@', ''))).map((p) => <Linha key={p} id={'p' + p} nome={p} />)}
                </div>
            )}

            <p className="text-[11px] font-black uppercase tracking-wider mt-5 mb-2" style={{ color: ORANGE }}>Para fora do iUser</p>
            <label className="block">
                <span className="text-[11px] font-bold" style={{ color: colors.textSecondary }}>Mensagem (vale para WhatsApp, Facebook, X e TikTok)</span>
                <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} className="w-full mt-1 rounded-2xl px-3.5 py-2.5 text-[13px] outline-none resize-none" style={{ background: colors.surface, border: `1.5px solid ${colors.border}`, color: colors.textPrimary }} />
            </label>
            <div className="grid grid-cols-4 gap-x-2 gap-y-3 mt-3">
                {externo.map((e) => (
                    <button key={e.id} onClick={() => mostrar(e.aviso)} className="flex flex-col items-center gap-1.5 active:scale-95">
                        <span className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: e.bg }}>{e.icone}</span><span className="text-[11px] font-black">{e.nome}</span>
                    </button>
                ))}
                <button onClick={() => { setCopiado(true); mostrar('Link copiado!'); setTimeout(() => setCopiado(false), 2200) }} className="flex flex-col items-center gap-1.5 active:scale-95"><span className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>{copiado ? <Check size={22} style={{ color: '#16a34a' }} /> : <Copy size={22} />}</span><span className="text-[11px] font-black">Copiar link</span></button>
                <button onClick={() => mostrar('Abrindo as opções do aparelho (exemplo)')} className="flex flex-col items-center gap-1.5 active:scale-95"><span className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}><MoreHorizontal size={22} /></span><span className="text-[11px] font-black">Mais</span></button>
            </div>
            <p className="text-[11px] leading-snug mt-4" style={{ color: colors.textSecondary }}><Send size={11} className="inline mr-1" />Instagram e TikTok não aceitam link por endereço: o iUser copia o link e abre o aplicativo para você colar.</p>
        </FolhaCasca>
    )
}
