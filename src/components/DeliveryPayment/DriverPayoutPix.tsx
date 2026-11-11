// Motorista: a chave Pix para RECEBER — do passageiro que paga a corrida por Pix (depois de escolhê-lo) e da loja nas entregas. Privada: só aparece a quem
// for te pagar, e só na hora (get_ride_driver_pix / get_delivery_payment_view).
// Tom de conversa (é dinheiro que ELE vai receber): diz o ganho primeiro, o cuidado com a chave logo antes do botão. Tocar em "Salvar" é a autorização
// (o texto acima do botão diz exatamente o que se autoriza); o banco continua exigindo `p_consent`.
'use client'

import { useEffect, useState } from 'react'
import { Banknote, Check, Lock } from 'lucide-react'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase/client'
import { PIX_TYPE_LABEL } from '@/modules/delivery-search'

interface Status { required: boolean; registered: boolean; type: string | null; masked: string | null }

const ORANGE = '#f97316'
const GREEN = '#16a34a'

// A ordem é a de quem mais usa no dia a dia; cada tipo tem um exemplo do que escrever.
const TYPES: { id: string; label: string; hint: string; mode: 'text' | 'email' | 'tel' | 'numeric' }[] = [
    { id: 'phone', label: 'Celular', hint: '(69) 99999-9999', mode: 'tel' },
    { id: 'cpf', label: 'CPF', hint: '000.000.000-00', mode: 'numeric' },
    { id: 'email', label: 'E-mail', hint: 'voce@email.com', mode: 'email' },
    { id: 'random', label: 'Aleatória', hint: 'Cole a chave aqui', mode: 'text' },
    { id: 'cnpj', label: 'CNPJ', hint: '00.000.000/0000-00', mode: 'numeric' },
]

export default function DriverPayoutPix() {
    const [status, setStatus] = useState<Status | null>(null)
    const [type, setType] = useState('phone')
    const [key, setKey] = useState('')
    const [busy, setBusy] = useState(false)
    const [editing, setEditing] = useState(false)

    const load = async () => {
        const { data, error } = await supabase.rpc('get_my_payout_status')
        if (!error) setStatus(data as Status)
    }
    useEffect(() => { load() }, [])

    if (!status) return null

    const t = TYPES.find((x) => x.id === type) || TYPES[0]

    const save = async () => {
        setBusy(true)
        const { error } = await supabase.rpc('set_my_payout_pix', { p_type: type, p_key: key, p_consent: true })
        setBusy(false)
        if (error) {
            toast.error(error.hint === 'invalid_pix' ? `Essa chave não parece um ${t.label.toLowerCase()} válido. Confere pra gente?` : error.message)
            return
        }
        toast.success('Prontinho! Agora você recebe direto no seu Pix.')
        setKey(''); setEditing(false); load()
    }

    if (status.registered && !editing) {
        return (
            <div className="mb-3 flex items-center gap-3 rounded-2xl border p-3" style={{ borderColor: `${GREEN}55`, background: `${GREEN}0f` }}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: GREEN }}><Check size={18} strokeWidth={3} /></span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black">Tudo certo para receber</p>
                    <p className="truncate text-xs opacity-70">Passageiros e lojas pagam no seu Pix · {PIX_TYPE_LABEL[status.type || ''] || 'Chave'} {status.masked}</p>
                </div>
                <button type="button" className="shrink-0 text-xs font-black underline" onClick={() => setEditing(true)}>Trocar</button>
            </div>
        )
    }

    return (
        <div className="mb-3 flex flex-col gap-3 rounded-2xl border p-4" style={{ borderColor: `${ORANGE}55`, background: `${ORANGE}0d` }}>
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: ORANGE }}><Banknote size={20} /></span>
                <div>
                    {!editing && <p className="mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white" style={{ background: ORANGE }}>Você ainda não cadastrou seu Pix</p>}
                    <p className="text-base font-black leading-tight">Onde você quer receber?</p>
                    <p className="mt-1 text-xs opacity-80">Quem escolhe pagar a corrida por Pix vê sua chave assim que te escolhe, e nas entregas a loja te paga por ela. Deixe aqui e é só aceitar e receber.</p>
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo da chave Pix">
                {TYPES.map((x) => {
                    const on = x.id === type
                    return (
                        <button key={x.id} type="button" role="radio" aria-checked={on} onClick={() => { setType(x.id); setKey('') }}
                            className="rounded-full border px-3 py-1.5 text-xs font-black"
                            style={on ? { background: ORANGE, borderColor: ORANGE, color: '#fff' } : { borderColor: 'currentColor', opacity: 0.6 }}>
                            {x.label}
                        </button>
                    )
                })}
            </div>

            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={t.hint} inputMode={t.mode === 'email' ? 'email' : t.mode === 'tel' ? 'tel' : t.mode === 'numeric' ? 'numeric' : 'text'}
                type={t.mode === 'email' ? 'email' : 'text'} aria-label={`Sua chave Pix (${t.label})`}
                className="h-12 rounded-xl border bg-transparent px-3 text-base font-bold outline-none" autoComplete="off" />

            <p className="flex items-start gap-2 text-xs opacity-75">
                <Lock size={14} className="mt-0.5 shrink-0" />
                <span>Sua chave fica guardada com a gente. Só vê quem vai te pagar: o passageiro que te escolheu e paga por Pix, ou a loja da entrega que você aceitou.</span>
            </p>

            <div className="flex gap-2">
                {editing && (
                    <button type="button" onClick={() => { setEditing(false); setKey('') }} className="h-12 rounded-full border px-4 text-sm font-black">Cancelar</button>
                )}
                <button type="button" disabled={busy || !key.trim()} onClick={save} className="h-12 flex-1 rounded-full text-sm font-black text-white disabled:opacity-50" style={{ background: ORANGE }}>
                    {busy ? 'Salvando…' : 'Salvar meu Pix'}
                </button>
            </div>
        </div>
    )
}
