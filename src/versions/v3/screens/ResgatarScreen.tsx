// versions/v3/screens/ResgatarScreen.tsx — CARTÃO DE CRÉDITO DO iUSER (migration 20261130000085).
// A pessoa escaneia o QR do cartão impresso (ou digita o código): a tela confere (check_iuser_credit, não gasta nada), mostra quanto vale
// e GUARDA o código neste aparelho (CREDIT_CODE_KEY); no carrinho ele já aparece escrito no campo de código e o desconto entra no pedido.
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Gift, Check, ShoppingBag, Store, LogIn } from 'lucide-react'
import Header from '@/components/Header'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { supabase } from '@/lib/supabase/client'
import { CREDIT_CODE_KEY } from '@/lib/campaignRedemption'
import { Spinner } from '@/components/Spinner'

const ORANGE = '#f97316'
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
type Result = { ok: true; value: number; minOrder: number; endsAt: string | null } | { ok: false; message: string }

export default function ResgatarScreen() {
    const router = useRouter()
    const { colors } = useTheme()
    const { userId, loading } = useProfile()
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState(false)
    const [res, setRes] = useState<Result | null>(null)

    const check = async (raw: string) => {
        const c = raw.trim().toUpperCase()
        if (c.length < 4) return
        setBusy(true); setRes(null)
        const { data, error } = await supabase.rpc('check_iuser_credit', { p_code: c, p_store: null })
        setBusy(false)
        const d = data as any
        if (error || !d) { setRes({ ok: false, message: 'Não deu para conferir agora. Tente de novo.' }); return }
        if (!d.found) { setRes({ ok: false, message: 'Este código não é de um cartão do iUser. Confira as letras.' }); return }
        if (!d.ok) { setRes({ ok: false, message: d.error || 'Este cartão não vale mais.' }); return }
        try { localStorage.setItem(CREDIT_CODE_KEY, c) } catch { /* sem storage: a pessoa digita no carrinho */ }
        setRes({ ok: true, value: Number(d.value) || 0, minOrder: Number(d.min_order) || 0, endsAt: d.ends_at || null })
    }

    // o QR do cartão traz ?codigo=
    useEffect(() => {
        const c = new URLSearchParams(window.location.search).get('codigo') || ''
        if (c) setCode(c.toUpperCase().slice(0, 20))
    }, [])
    useEffect(() => { if (!loading && userId && code && !res && !busy) void check(code) }, [loading, userId]) // eslint-disable-line react-hooks/exhaustive-deps

    const back = () => { if (window.history.length > 1) router.back(); else router.push('/') }
    const loginPath = `/login?redirect=${encodeURIComponent(`/resgatar${code ? `?codigo=${encodeURIComponent(code)}` : ''}`)}`

    return (
        <div className="pb-12">
            <Header title="Cartão iUser" showBack onBack={back} />
            <section className="mt-2 rounded-3xl p-5 text-white" style={{ background: `linear-gradient(140deg, ${ORANGE}, #dc2626)` }}>
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}><Gift size={22} /></span>
                <h1 className="text-xl font-black mt-3 leading-tight">Você ganhou um desconto no iUser</h1>
                <p className="text-[13.5px] mt-1" style={{ opacity: 0.92 }}>Vale em qualquer loja do iUser, num pedido feito pelo app. O desconto sai do iUser: a loja recebe o valor inteiro.</p>
            </section>

            <div className="mt-4 rounded-3xl p-4" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <label className="text-[12px] font-bold" style={{ color: colors.textSecondary }}>Código do cartão</label>
                <div className="mt-1.5 flex gap-2">
                    <input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)); setRes(null) }}
                        placeholder="IU..." autoCapitalize="characters" className="flex-1 min-w-0 h-12 px-4 rounded-full text-[16px] font-black tracking-[0.15em] outline-none"
                        style={{ background: colors.background, border: `1.5px solid ${colors.border}`, color: colors.textPrimary }} />
                    {userId
                        ? <button onClick={() => check(code)} disabled={busy || code.length < 4} className="h-12 px-5 rounded-full text-[14px] font-black text-white disabled:opacity-50" style={{ background: ORANGE }}>{busy ? <Spinner size={18} color="#fff" /> : 'Usar'}</button>
                        : null}
                </div>

                {!loading && !userId && (
                    <button onClick={() => router.push(loginPath)} className="mt-4 w-full h-12 rounded-full text-[14px] font-black text-white flex items-center justify-center gap-2" style={{ background: ORANGE }}>
                        <LogIn size={17} /> Entrar para usar o cartão
                    </button>
                )}

                {res && !res.ok && <p className="mt-3 text-[13.5px] font-bold" style={{ color: '#ef4444' }}>{res.message}</p>}
                {res && res.ok && (
                    <div className="mt-4">
                        <p className="text-[15px] font-black flex items-center gap-2" style={{ color: '#16a34a' }}><Check size={18} /> {brl(res.value)} de desconto guardados para você</p>
                        <ul className="mt-2 text-[13px] flex flex-col gap-1" style={{ color: colors.textSecondary }}>
                            {res.minOrder > 0 && <li>• Em pedidos a partir de {brl(res.minOrder)} (sem contar a entrega).</li>}
                            {res.endsAt && <li>• Vale até {new Date(res.endsAt).toLocaleDateString('pt-BR')}.</li>}
                            <li>• No carrinho, o código já vai estar escrito: é só tocar em <b>Aplicar</b>.</li>
                            <li>• Uma vez por pessoa. Não vale na sua própria loja.</li>
                        </ul>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <button onClick={() => router.push('/lojas')} className="h-11 rounded-full text-[13.5px] font-black text-white flex items-center justify-center gap-1.5" style={{ background: ORANGE }}><Store size={16} /> Ver lojas</button>
                            <button onClick={() => router.push('/carrinho')} className="h-11 rounded-full text-[13.5px] font-black flex items-center justify-center gap-1.5" style={{ background: `${colors.border}40`, color: colors.textPrimary }}><ShoppingBag size={16} /> Meu carrinho</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
