// /dev-login?as=owner|client&to=/caminho — só no ambiente LOCAL de desenvolvimento: entra sozinha com a conta de teste (senha local) e vai para `to`.
// Cada tela da página /tres-telas roda num endereço diferente (owner.localhost, client.localhost...), então cada uma guarda a SUA sessão.
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { isLocalDevOnly } from '@/lib/devOnly'

export default function DevLoginPage() {
    const [msg, setMsg] = useState('Entrando…')
    useEffect(() => {
        if (!isLocalDevOnly()) { setMsg('Indisponível neste ambiente.'); return }
        const sp = new URLSearchParams(window.location.search)
        const as = sp.get('as') || 'owner'
        const to = sp.get('to') || '/'
        if (!to.startsWith('/') || to.startsWith('//')) { setMsg('Destino inválido.'); return }
        // &gps=1 liga o GPS de teste do motorista nesta aba (anda pelas ruas até o alvo do mapa); &gps=0 desliga
        try { if (sp.get('gps') === '1') window.localStorage.setItem('iuser_dev_gps', '1'); else if (sp.get('gps') === '0') window.localStorage.removeItem('iuser_dev_gps') } catch { /* sem armazenamento */ }
        ;(async () => {
            const cred = await fetch(`/api/dev/credentials?as=${encodeURIComponent(as)}`).then((r) => (r.ok ? r.json() : null))
            if (!cred?.email) { setMsg('Conta de teste não encontrada (rode scripts/local/seed-motoboys.mjs).'); return }
            const { data: cur } = await supabase.auth.getUser()
            if (cur.user?.email !== cred.email) {
                const { error } = await supabase.auth.signInWithPassword({ email: cred.email, password: cred.password })
                if (error) { setMsg(`Não consegui entrar: ${error.message}`); return }
            }
            window.location.replace(to)
        })().catch((e) => setMsg(String(e?.message || e)))
    }, [])
    return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', color: '#64748b' }}>{msg}</div>
}
