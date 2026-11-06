// Motorista: chave Pix para receber o frete das entregas do novo fluxo. Privada: só aparece à loja que for te pagar, e só na hora do pagamento.
'use client'

import { useEffect, useState } from 'react'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase/client'
import { PIX_TYPE_LABEL } from '@/modules/delivery-search'

interface Status { required: boolean; registered: boolean; type: string | null; masked: string | null }

export default function DriverPayoutPix() {
    const [status, setStatus] = useState<Status | null>(null)
    const [type, setType] = useState('email')
    const [key, setKey] = useState('')
    const [consent, setConsent] = useState(false)
    const [busy, setBusy] = useState(false)
    const [editing, setEditing] = useState(false)

    const load = async () => {
        const { data, error } = await supabase.rpc('get_my_payout_status')
        if (!error) setStatus(data as Status)
    }
    useEffect(() => { load() }, [])

    // Só incomoda quando o novo fluxo estiver valendo (ou já houver chave): hoje fica invisível
    if (!status || (!status.required && !status.registered)) return null

    const save = async () => {
        setBusy(true)
        const { error } = await supabase.rpc('set_my_payout_pix', { p_type: type, p_key: key, p_consent: consent })
        setBusy(false)
        if (error) { toast.error(error.message); return }
        toast.success('Chave Pix salva.')
        setKey(''); setEditing(false); load()
    }

    return (
        <div className="rounded-xl border p-3 text-sm flex flex-col gap-2 mb-3">
            <p className="font-black">Chave Pix para receber o frete</p>
            {status.registered && !editing ? (
                <p className="text-xs">{PIX_TYPE_LABEL[status.type || ''] || 'Chave'}: {status.masked} <button type="button" className="ml-2 font-bold underline" onClick={() => setEditing(true)}>Trocar</button></p>
            ) : (
                <>
                    <p className="text-xs opacity-80">As entregas do novo fluxo são pagas direto pela loja, na sua chave Pix. Sem chave, não dá para aceitá-las.</p>
                    <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border p-2 text-sm">
                        {Object.entries(PIX_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Sua chave Pix" className="rounded-lg border p-2 text-sm" autoComplete="off" />
                    <label className="flex items-start gap-2 text-xs">
                        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                        <span>Autorizo o iUser a mostrar esta chave à loja somente quando eu aceitar uma entrega dela, para ela me pagar o frete.</span>
                    </label>
                    <button type="button" disabled={busy || !key.trim() || !consent} onClick={save} className="rounded-full bg-orange-500 px-3 py-2 font-black text-white disabled:opacity-60">Salvar chave</button>
                </>
            )}
        </div>
    )
}
