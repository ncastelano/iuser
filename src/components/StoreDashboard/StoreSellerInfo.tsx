// src/components/StoreDashboard/StoreSellerInfo.tsx
//
// Editar loja → "Quem vende" (18/11/2026; migration 20261130000082). O Decreto 7.962/2013 manda quem vende pela internet mostrar
// nome/razão social, CPF/CNPJ e endereço. Aqui o dono preenche (o banco confere os dígitos em set_store_seller); a página da loja mostra
// o nome, o endereço e o documento — o CNPJ inteiro e o CPF MASCARADO (***.456.789-**). Embaixo, a declaração das licenças para quem vende
// remédio, bebida alcoólica, gás ou tabaco (guardada com a versão e a data).
'use client'

import { useEffect, useState } from 'react'
import { BadgeCheck, ShieldCheck } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { Spinner } from '@/components/Spinner'
import { ensureLegal } from '@/components/legal/LegalHost'
import { docValid, fetchMyLegal, fetchStoreSeller, formatDoc, saveStoreSeller } from '@/modules/legal'

export default function StoreSellerInfo({ storeId, onSaved }: { storeId: string; onSaved?: () => void }) {
    const { colors } = useTheme()
    const [loading, setLoading] = useState(true)
    const [docType, setDocType] = useState<'cpf' | 'cnpj'>('cnpj')
    const [doc, setDoc] = useState('')
    const [name, setName] = useState('')
    const [address, setAddress] = useState('')
    const [shown, setShown] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [regulated, setRegulated] = useState<string | null>(null)   // data do aceite

    useEffect(() => {
        let alive = true
        Promise.all([fetchStoreSeller(storeId), fetchMyLegal(storeId)]).then(([s, l]) => {
            if (!alive) return
            if (s && s.name) { setDocType(s.docType); setDoc(formatDoc(s.docType, s.doc)); setName(s.name); setAddress(s.address); setShown(s.docPublic) }
            setRegulated(l?.store_regulated?.accepted ? l.store_regulated.acceptedAt : null)
            setLoading(false)
        })
        return () => { alive = false }
    }, [storeId])

    const docOk = docValid(docType, doc)
    const canSave = docOk && name.trim().length >= 2 && address.trim().length >= 5 && !busy
    const save = async () => {
        setBusy(true)
        try {
            const pub = await saveStoreSeller(storeId, { name: name.trim(), docType, doc, address: address.trim() })
            setShown(pub); toast.success('Dados de quem vende salvos'); onSaved?.()
        } catch (e: any) { toast.error(e?.message || 'Não deu para salvar') }
        finally { setBusy(false) }
    }
    const declare = async () => {
        if (await ensureLegal('store_regulated', storeId)) {
            const l = await fetchMyLegal(storeId)
            setRegulated(l?.store_regulated?.acceptedAt || new Date().toISOString())
        }
    }

    if (loading) return <div className="py-8 flex justify-center"><Spinner size={22} color="#f97316" /></div>
    const input = 'w-full h-11 px-3 rounded-xl text-[14px]'
    const inputStyle = { background: `${colors.border}25`, color: colors.textPrimary, border: `1px solid ${colors.border}` }

    return (
        <div className="flex flex-col gap-4">
            <p className="text-[13px]" style={{ color: colors.textSecondary }}>
                A lei do comércio eletrônico (Decreto 7.962/2013) pede que o cliente saiba quem vende: nome ou razão social, CPF ou CNPJ e endereço.
                Isso aparece na página da sua loja. <b>O CNPJ aparece inteiro; o CPF aparece só em parte</b> (ex.: ***.456.789-**).
            </p>

            <div className="flex gap-2">
                {(['cnpj', 'cpf'] as const).map((t) => (
                    <button key={t} onClick={() => { setDocType(t); setDoc(formatDoc(t, doc)) }} className="flex-1 h-10 rounded-full text-[13px] font-black"
                        style={docType === t ? { background: '#f97316', color: '#fff' } : { background: `${colors.border}30`, color: colors.textPrimary }}>
                        {t === 'cnpj' ? 'Tenho CNPJ' : 'Vendo com CPF'}
                    </button>
                ))}
            </div>

            <label className="flex flex-col gap-1">
                <span className="text-[12px] font-bold" style={{ color: colors.textPrimary }}>{docType === 'cnpj' ? 'CNPJ' : 'CPF'}</span>
                <input value={doc} onChange={(e) => setDoc(formatDoc(docType, e.target.value))} inputMode="numeric" placeholder={docType === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'} className={input} style={{ ...inputStyle, borderColor: doc && !docOk ? '#ef4444' : colors.border }} />
                {doc && !docOk && <span className="text-[11px]" style={{ color: '#ef4444' }}>Confira os números: este {docType.toUpperCase()} não é válido.</span>}
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-[12px] font-bold" style={{ color: colors.textPrimary }}>{docType === 'cnpj' ? 'Razão social' : 'Seu nome completo'}</span>
                <input value={name} onChange={(e) => setName(e.target.value.slice(0, 120))} className={input} style={inputStyle} />
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-[12px] font-bold" style={{ color: colors.textPrimary }}>Endereço de atendimento</span>
                <input value={address} onChange={(e) => setAddress(e.target.value.slice(0, 200))} placeholder="Rua, número, bairro, cidade/UF" className={input} style={inputStyle} />
            </label>
            {shown && <p className="text-[12px] flex items-center gap-1.5" style={{ color: '#16a34a' }}><BadgeCheck size={14} /> Na página da loja: {name} · {shown}</p>}
            <button onClick={save} disabled={!canSave} className="h-11 rounded-full text-[14px] font-black text-white disabled:opacity-50" style={{ background: '#f97316' }}>{busy ? 'Salvando…' : 'Salvar'}</button>

            <div className="rounded-2xl p-3.5 mt-1" style={{ background: `${colors.border}20`, border: `1px solid ${colors.border}` }}>
                <p className="text-[13px] font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><ShieldCheck size={16} style={{ color: '#f97316' }} /> Vende remédio, bebida alcoólica, gás ou tabaco?</p>
                {regulated ? (
                    <p className="text-[12px] mt-1" style={{ color: '#16a34a' }}>Você declarou que tem as licenças em {new Date(regulated).toLocaleDateString('pt-BR')}.</p>
                ) : (
                    <>
                        <p className="text-[12px] mt-1" style={{ color: colors.textSecondary }}>Esses produtos exigem licença (vigilância sanitária, ANP) e não podem ser vendidos a menores. Declare que sua loja segue as regras.</p>
                        <button onClick={declare} className="mt-2 h-9 px-4 rounded-full text-[12.5px] font-black" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>Ver e declarar</button>
                    </>
                )}
            </div>
        </div>
    )
}
