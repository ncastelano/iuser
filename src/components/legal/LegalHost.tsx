// src/components/legal/LegalHost.tsx
//
// ACEITES LEGAIS (18/11/2026; migration 20261130000082), montado uma vez em providers.tsx:
//  1. TERMOS: quem está logado e ainda não aceitou a versão EM VIGOR dos Termos de Uso + Política de Privacidade vê uma folha que só
//     fecha aceitando (ou saindo da conta). Não aparece nas páginas dos próprios textos nem no login/cadastro (termsGateHidden).
//  2. DECLARAÇÕES: `ensureLegal('driver_requirements')` / `ensureLegal('store_regulated', lojaId)` — devolve true se já aceitou; senão
//     abre a folha da declaração e devolve true/false conforme a pessoa aceite. O banco grava quem, a versão e quando (e o modo motorista
//     só liga com a declaração, no próprio banco).
'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { CheckCircle2, FileText, ShieldCheck, X } from 'lucide-react'
import { useProfile } from '@/app/contexts/ProfileContext'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { acceptLegal, DECLARATIONS, fetchMyLegal, termsGateHidden, type LegalDoc } from '@/modules/legal'

type Ask = { doc: Exclude<LegalDoc, 'terms'>; scope: string | null; resolve: (ok: boolean) => void }
let opener: ((a: Ask) => void) | null = null

/** true = a pessoa já aceitou (ou aceitou agora). Sem o host montado, deixa seguir (o banco ainda confere o que importa). */
export async function ensureLegal(doc: Exclude<LegalDoc, 'terms'>, scope: string | null = null): Promise<boolean> {
    const mine = await fetchMyLegal(scope)
    if (mine && mine[doc]?.accepted) return true
    if (!opener) return true
    return new Promise<boolean>((resolve) => opener!({ doc, scope, resolve }))
}

const okKey = (uid: string, v: string) => `iuser_terms_ok_${uid}_${v}`

export default function LegalHost() {
    const { userId } = useProfile()
    const path = usePathname() || '/'
    const [terms, setTerms] = useState<{ version: string } | null>(null)
    const [ask, setAsk] = useState<Ask | null>(null)
    const [busy, setBusy] = useState(false)
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])

    useEffect(() => {
        opener = (a) => setAsk(a)
        return () => { opener = null }
    }, [])

    // termos: confere uma vez por sessão (ou ao trocar de conta)
    useEffect(() => {
        let alive = true
        setTerms(null)
        if (!userId) return
        fetchMyLegal().then((m) => {
            const t = m?.terms
            if (!alive || !t || t.accepted) return
            try { if (sessionStorage.getItem(okKey(userId, t.version))) return } catch { /* sem storage: pergunta */ }
            setTerms({ version: t.version })
        })
        return () => { alive = false }
    }, [userId])

    const acceptTerms = useCallback(async () => {
        if (!userId || !terms) return
        setBusy(true)
        try {
            await acceptLegal('terms')
            try { sessionStorage.setItem(okKey(userId, terms.version), '1') } catch { /* ok */ }
            setTerms(null)
        } catch (e: any) { toast.error(e?.message || 'Não deu certo. Tente de novo.') }
        finally { setBusy(false) }
    }, [userId, terms])

    const answer = useCallback(async (ok: boolean) => {
        if (!ask) return
        if (!ok) { ask.resolve(false); setAsk(null); return }
        setBusy(true)
        try { await acceptLegal(ask.doc, ask.scope); ask.resolve(true); setAsk(null) }
        catch (e: any) { toast.error(e?.message || 'Não deu certo. Tente de novo.') }
        finally { setBusy(false) }
    }, [ask])

    if (!mounted) return null
    const showTerms = !!terms && !!userId && !termsGateHidden(path)
    if (!showTerms && !ask) return null

    const sheet = (children: React.ReactNode, onClose?: () => void) => (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
            <div className="relative w-full sm:max-w-md max-h-[88dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(20px+env(safe-area-inset-bottom))]" style={{ background: '#ffffff', color: '#262626' }}>
                {onClose && <button onClick={onClose} aria-label="Fechar" className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: '#f5f5f5' }}><X size={18} /></button>}
                {children}
            </div>
        </div>
    )

    if (ask) {
        const d = DECLARATIONS[ask.doc]
        return createPortal(sheet(
            <>
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3" style={{ background: '#f9731618', color: '#ea580c' }}><ShieldCheck size={22} /></div>
                <h2 className="text-lg font-black pr-8">{d.title}</h2>
                <p className="text-[13.5px] mt-1.5" style={{ color: '#525252' }}>{d.intro}</p>
                <ul className="mt-3 flex flex-col gap-2">
                    {d.items.map((t) => <li key={t} className="flex gap-2 text-[13.5px] leading-snug"><CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#16a34a' }} />{t}</li>)}
                </ul>
                <p className="text-[12px] mt-3" style={{ color: '#737373' }}>Declaração falsa pode levar ao encerramento da conta. Veja os <a href="/termos" target="_blank" className="underline">Termos de Uso</a>.</p>
                <button onClick={() => answer(true)} disabled={busy} className="mt-4 w-full h-12 rounded-full text-[14px] font-black text-white disabled:opacity-60" style={{ background: '#f97316' }}>{busy ? 'Salvando…' : d.button}</button>
                <button onClick={() => answer(false)} disabled={busy} className="mt-2 w-full h-10 rounded-full text-[13px] font-bold" style={{ color: '#525252' }}>Agora não</button>
            </>,
            () => answer(false),
        ), document.body)
    }

    return createPortal(sheet(
        <>
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-3" style={{ background: '#f9731618', color: '#ea580c' }}><FileText size={22} /></div>
            <h2 className="text-lg font-black">Termos de Uso e Privacidade</h2>
            <p className="text-[13.5px] mt-1.5" style={{ color: '#525252' }}>
                Para continuar usando o iUser, leia e aceite os nossos <a href="/termos" className="underline font-bold">Termos de Uso</a> e a <a href="/privacidade" className="underline font-bold">Política de Privacidade</a>.
                Eles explicam como o iUser funciona, quem é responsável por cada coisa e como cuidamos dos seus dados.
            </p>
            <button onClick={acceptTerms} disabled={busy} className="mt-4 w-full h-12 rounded-full text-[14px] font-black text-white disabled:opacity-60" style={{ background: '#f97316' }}>{busy ? 'Salvando…' : 'Li e aceito'}</button>
            <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }} className="mt-2 w-full h-10 rounded-full text-[13px] font-bold" style={{ color: '#525252' }}>Não aceito · sair da conta</button>
        </>,
    ), document.body)
}
