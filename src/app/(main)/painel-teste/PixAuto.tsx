// src/app/(main)/painel-teste/PixAuto.tsx — o RECEBIMENTO AUTOMÁTICO dos produtos digitais no laboratório /painel-teste (só teste, nada grava).
// Hoje (V1) o Pix vai direto para a chave da loja e a loja precisa conferir e tocar em "Liberar acesso". No fluxo automático o cliente paga uma
// cobrança Pix gerada pelo iUser (Asaas), o banco avisa na hora em que o dinheiro cai e o acesso é liberado sozinho, 24 horas por dia.
// O dinheiro é dividido (split) para a conta Asaas da própria loja: o iUser não guarda o dinheiro de ninguém.
'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronRight, Clock, Copy, GraduationCap, Landmark, ShieldCheck, Zap } from 'lucide-react'
import type { ThemeColors } from '@/app/contexts/theme'
import { brl } from './dados'
import { FolhaCasca, Switch, useAviso } from './labui'

export type AutoEstado = 'off' | 'analise' | 'ativo'
const ROXO = '#8b5cf6'
const VERDE = '#16a34a'

/** o cartão de estado do recebimento automático (no alto da página Digital) */
export function CartaoAuto({ c, auto, setAuto, onAtivar, onVer }: { c: ThemeColors; auto: AutoEstado; setAuto: (a: AutoEstado) => void; onAtivar: () => void; onVer: () => void }) {
    if (auto === 'ativo') {
        return (
            <div className="rounded-3xl p-3.5" style={{ background: `${VERDE}12`, border: `1.5px solid ${VERDE}55` }}>
                <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${VERDE}28`, color: VERDE }}><Zap size={19} /></span>
                    <div className="min-w-0 flex-1"><p className="text-[14px] font-black leading-tight">Pix automático ligado</p><p className="text-[12px] leading-snug mt-0.5">O cliente paga e o acesso é liberado <b>na hora</b>, a qualquer hora, sem você fazer nada.</p></div>
                </div>
                <div className="flex gap-2 mt-3">
                    <button onClick={onVer} className="flex-1 h-10 rounded-full text-[12.5px] font-black active:scale-95" style={{ border: `1px solid ${c.border}`, background: c.background }}>Ver como o cliente compra</button>
                    <button onClick={() => setAuto('off')} className="h-10 px-4 rounded-full text-[12.5px] font-black active:scale-95" style={{ border: `1px solid ${c.border}`, color: c.textSecondary }}>Desligar</button>
                </div>
            </div>
        )
    }
    if (auto === 'analise') {
        return (
            <div className="rounded-3xl p-3.5 flex gap-3" style={{ background: '#f59e0b16', border: '1.5px solid #f59e0b66' }}>
                <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#f59e0b30', color: '#b45309' }}><Clock size={19} /></span>
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-black leading-tight">Sua conta está em análise</p>
                    <p className="text-[12px] leading-snug mt-0.5">Costuma levar poucos minutos (até 1 dia útil). Enquanto isso, os pagamentos continuam como hoje: você confere e libera.</p>
                    <button onClick={() => setAuto('ativo')} className="mt-2 h-8 px-3 rounded-full text-[11.5px] font-black text-white active:scale-95" style={{ background: '#16a34a' }}>Simular aprovação (só no laboratório)</button>
                </div>
            </div>
        )
    }
    return (
        <div className="rounded-3xl p-3.5" style={{ background: `${ROXO}10`, border: `1.5px solid ${ROXO}44` }}>
            <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${ROXO}28`, color: ROXO }}><Zap size={19} /></span>
                <div className="min-w-0 flex-1"><p className="text-[14px] font-black leading-tight">Receba sem conferir nada, 24 horas</p><p className="text-[12px] leading-snug mt-0.5">Hoje você precisa olhar o seu banco e liberar cada venda. Com o Pix automático, o acesso sai sozinho no segundo em que o dinheiro cai.</p></div>
            </div>
            <button onClick={onAtivar} className="w-full mt-3 h-11 rounded-full text-[13.5px] font-black text-white active:scale-95" style={{ background: ROXO }}>Ativar o recebimento automático</button>
        </div>
    )
}

/** ativar: três passos curtos (quem recebe → onde cai → taxas e termos) e vai para análise */
export function AtivarFolha({ c, onClose, onEnviar }: { c: ThemeColors; onClose: () => void; onEnviar: () => void }) {
    const [passo, setPasso] = useState(1)
    const [aceito, setAceito] = useState(false)
    const campo = { background: c.surface, border: `1.5px solid ${c.border}`, color: c.textPrimary }
    const rot = (t: string) => <p className="text-[11px] font-black uppercase tracking-wider mb-1.5 mt-3.5" style={{ color: c.textSecondary }}>{t}</p>
    const inp = (v: string, ph?: string) => <input defaultValue={v} placeholder={ph} className="w-full h-12 rounded-2xl px-3.5 text-[14px] font-semibold outline-none" style={campo} />
    return (
        <FolhaCasca titulo="Pix automático" sub={`Passo ${passo} de 3`} cor={ROXO} icone={<Zap size={18} />} onClose={onClose} z={95}
            rodape={<div className="flex gap-2">
                {passo > 1 && <button onClick={() => setPasso(passo - 1)} className="h-12 px-5 rounded-full text-[13px] font-black" style={{ border: `1px solid ${c.border}` }}>Voltar</button>}
                {passo < 3
                    ? <button onClick={() => setPasso(passo + 1)} className="flex-1 h-12 rounded-full text-[14px] font-black text-white active:scale-95" style={{ background: ROXO }}>Continuar</button>
                    : <button disabled={!aceito} onClick={onEnviar} className="flex-1 h-12 rounded-full text-[14px] font-black text-white disabled:opacity-40 active:scale-95" style={{ background: ROXO }}>Enviar para análise</button>}
            </div>}>
            <div className="flex gap-1.5 mb-1">{[1, 2, 3].map((n) => <span key={n} className="flex-1 h-1.5 rounded-full" style={{ background: n <= passo ? ROXO : `${c.border}` }} />)}</div>
            {passo === 1 && (<>
                <p className="text-[12.5px] leading-snug mt-3" style={{ color: c.textSecondary }}>Para receber os Pix, o banco precisa saber quem você é. Já preenchemos o que o iUser tem do seu cadastro.</p>
                {rot('Nome ou razão social')}{inp('Pizzaria Forno de Ouro Ltda')}
                {rot('CPF ou CNPJ')}{inp('12.345.678/0001-90')}
                {rot('Data de abertura ou nascimento')}{inp('14/03/2019')}
                {rot('Celular')}{inp('(69) 99999-0000')}
            </>)}
            {passo === 2 && (<>
                <p className="text-[12.5px] leading-snug mt-3" style={{ color: c.textSecondary }}>O dinheiro de cada venda cai <b>direto na conta da sua loja</b>. O iUser não guarda nem segura o seu dinheiro.</p>
                <div className="rounded-3xl p-3.5 mt-3 flex gap-3" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                    <span className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${ROXO}22`, color: ROXO }}><Landmark size={19} /></span>
                    <div className="min-w-0"><p className="text-[13.5px] font-black">Conta digital da loja</p><p className="text-[11.5px] leading-snug mt-0.5" style={{ color: c.textSecondary }}>Criada para você na Asaas, nossa parceira de pagamentos. Você vê o saldo e saca quando quiser.</p></div>
                </div>
                {rot('Sacar para a chave Pix')}{inp('pizzaria@forno.com.br')}
                <p className="text-[11.5px] mt-1.5" style={{ color: c.textSecondary }}>É a mesma chave que você já usa na loja. Você pode trocar depois.</p>
            </>)}
            {passo === 3 && (<>
                <p className="text-[12.5px] leading-snug mt-3" style={{ color: c.textSecondary }}>Quanto custa, antes de ligar:</p>
                <div className="rounded-3xl overflow-hidden mt-2" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                    {[['Taxa do Pix', 'A da tabela da Asaas, descontada de cada venda. Mostramos o valor exato antes de você ativar.'], ['Taxa do iUser', 'R$ 0 no plano Pré-pago · R$ 0,50 por venda no Pós-pago'], ['Mensalidade', 'Nenhuma. Só paga quando vende.']].map(([t, d], i) => (
                        <div key={t} className="px-3.5 py-3" style={{ borderTop: i ? `1px solid ${c.border}` : undefined }}><p className="text-[13px] font-black">{t}</p><p className="text-[11.5px] leading-snug mt-0.5" style={{ color: c.textSecondary }}>{d}</p></div>
                    ))}
                </div>
                <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
                    <button role="checkbox" aria-checked={aceito} onClick={() => setAceito(!aceito)} className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5" style={aceito ? { background: ROXO, color: '#fff' } : { border: `2px solid ${c.border}` }}>{aceito && <Check size={14} />}</button>
                    <span className="text-[12px] leading-snug">Li e aceito os termos da Asaas e do iUser para receber pagamentos pela plataforma.</span>
                </label>
                <p className="text-[11.5px] flex items-center gap-1.5 mt-3" style={{ color: c.textSecondary }}><ShieldCheck size={14} style={{ color: VERDE }} />Seus dados ficam protegidos e só a Asaas os vê.</p>
            </>)}
        </FolhaCasca>
    )
}

/** como o CLIENTE vê: o Pix com QR, a espera e a confirmação sozinha */
export function ClienteVe({ c, onClose }: { c: ThemeColors; onClose: () => void }) {
    const [pago, setPago] = useState(false)
    const [seg, setSeg] = useState(29 * 60 + 41)
    const { mostrar, node } = useAviso()
    useEffect(() => { if (pago) return; const id = setInterval(() => setSeg((s) => Math.max(0, s - 1)), 1000); return () => clearInterval(id) }, [pago])
    const mm = String(Math.floor(seg / 60)).padStart(2, '0'), ss = String(seg % 60).padStart(2, '0')
    return (
        <FolhaCasca titulo={pago ? 'Pagamento confirmado' : 'Pague com Pix'} sub="Como o cliente vê (exemplo)" cor={pago ? VERDE : ROXO} icone={pago ? <Check size={18} /> : <GraduationCap size={18} />} onClose={onClose} z={95}
            rodape={pago
                ? <button onClick={onClose} className="w-full h-12 rounded-full text-[14px] font-black text-white" style={{ background: VERDE }}>Começar o curso</button>
                : <button onClick={() => setPago(true)} className="w-full h-12 rounded-full text-[13.5px] font-black active:scale-95" style={{ border: `1.5px dashed ${ROXO}`, color: ROXO }}>Simular: o cliente pagou o Pix</button>}>
            {node}
            {!pago ? (<>
                <div className="rounded-3xl p-3.5 flex items-center gap-3" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                    <span className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: `${ROXO}22`, color: ROXO }}><GraduationCap size={20} /></span>
                    <div className="min-w-0 flex-1"><p className="text-[13.5px] font-black truncate">Curso Pizza Napolitana</p><p className="text-[11.5px]" style={{ color: c.textSecondary }}>Pizzaria Forno de Ouro</p></div>
                    <p className="text-[16px] font-black">{brl(49.9)}</p>
                </div>
                <div className="mx-auto mt-4 w-44 h-44 rounded-2xl p-2 grid grid-cols-11 gap-[2px]" style={{ background: '#fff', border: `1px solid ${c.border}` }}>
                    {Array.from({ length: 121 }, (_, i) => <span key={i} style={{ background: ((i * 7 + (i % 11) * 3) % 5 < 2 || [0, 1, 2, 9, 10, 11, 12, 20, 21, 99, 100, 101, 109, 110, 111, 119, 120].includes(i)) ? '#111827' : '#fff' }} />)}
                </div>
                <p className="text-center text-[12px] font-bold mt-3 flex items-center justify-center gap-1.5" style={{ color: c.textSecondary }}><Clock size={13} />Vale por {mm}:{ss} · aguardando o pagamento…</p>
                <button onClick={() => mostrar('Código Pix copiado')} className="w-full mt-3 h-11 rounded-full text-[13px] font-black flex items-center justify-center gap-1.5 active:scale-95" style={{ border: `1px solid ${c.border}` }}><Copy size={14} />Copiar o código Pix</button>
                <p className="text-[11.5px] leading-snug mt-3 text-center" style={{ color: c.textSecondary }}>Assim que o banco confirmar, o acesso aparece aqui sozinho. Não precisa mandar comprovante.</p>
            </>) : (
                <div className="text-center py-4">
                    <span className="inline-flex w-20 h-20 rounded-full items-center justify-center text-white" style={{ background: VERDE }}><Check size={40} /></span>
                    <p className="text-[18px] font-black mt-4">Pronto, o acesso é seu!</p>
                    <p className="text-[12.5px] mt-1" style={{ color: c.textSecondary }}>Pix de {brl(49.9)} confirmado em 3 segundos.</p>
                    <p className="text-[12px] mt-4 flex items-center justify-center gap-1" style={{ color: c.textSecondary }}><ChevronRight size={13} />Está na sua biblioteca em Atividade → Biblioteca.</p>
                </div>
            )}
        </FolhaCasca>
    )
}

export { Switch }
