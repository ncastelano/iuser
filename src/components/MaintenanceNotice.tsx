// src/components/MaintenanceNotice.tsx
//
// Aviso de manutenção (ver lib/maintenance.ts). MaintenanceBanner = faixa fina no topo do site todo (montada em providers.tsx).
// MaintenanceCard = cartão grande, no estilo do aviso da home, para as telas de login/cadastro/recuperar senha.
'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { Layers, Palette, Server, Wrench } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { clearMaintenance, getMaintenance, probeSupabase, reportMaintenance, subscribeMaintenance } from '@/lib/maintenance'

const TITLE = 'O iUser está em manutenção'
const SHORT = 'O iUser está em manutenção. Voltamos já, com novidades!'
const MESSAGE =
    'Estamos ampliando nossos serviços e atualizando o banco de dados, o servidor e o design do app. ' +
    'Por enquanto não é possível entrar nem criar conta, e alguns dados podem não aparecer. Volte daqui a pouco: ' +
    'quando terminarmos, o iUser volta com novidades!'
const HIGHLIGHTS = [
    { icon: Layers, label: 'Mais serviços' },
    { icon: Server, label: 'Banco e servidor atualizados' },
    { icon: Palette, label: 'Novo design' },
]

export function useMaintenance(): boolean {
    return useSyncExternalStore(subscribeMaintenance, getMaintenance, () => false)
}

/** Liga/desliga pela URL (?manutencao=1 / 0) para conferir o visual, e re-testa o Supabase a cada minuto enquanto o aviso está ligado. */
function useMaintenanceWatch(active: boolean) {
    useEffect(() => {
        try {
            const p = new URLSearchParams(window.location.search).get('manutencao')
            if (p === '1') reportMaintenance()
            else if (p === '0') clearMaintenance(true)
        } catch { /* ignora */ }
    }, [])
    useEffect(() => {
        if (!active) return
        const t = setInterval(() => { void probeSupabase() }, 60_000)
        return () => clearInterval(t)
    }, [active])
}

export function MaintenanceBanner() {
    const active = useMaintenance()
    useMaintenanceWatch(active)
    // empurra a página para baixo da faixa fixa (sem isso ela cobre o topo das telas)
    useEffect(() => {
        if (!active) return
        const prev = document.body.style.paddingTop
        document.body.style.paddingTop = 'calc(env(safe-area-inset-top, 0px) + 34px)'
        return () => { document.body.style.paddingTop = prev }
    }, [active])
    if (!active) return null
    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-2 px-3 text-center text-[12px] font-extrabold text-white"
            style={{
                background: 'linear-gradient(90deg, #f97316, #dc2626)',
                paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)',
                paddingBottom: 6,
                boxShadow: '0 4px 14px -6px rgba(220,38,38,0.7)',
            }}
        >
            <Wrench size={14} className="flex-shrink-0" />
            <span>{SHORT}</span>
        </div>
    )
}

export function MaintenanceCard({ className = '' }: { className?: string }) {
    const { colors } = useTheme()
    const active = useMaintenance()
    useMaintenanceWatch(active)
    // Ao abrir uma tela de login, já pergunta ao Supabase (nessas telas nenhuma outra chamada acontece até a pessoa tentar entrar).
    useEffect(() => { void probeSupabase() }, [])
    if (!active) return null
    return (
        <section
            role="alert"
            aria-label="Aviso de manutenção do iUser"
            className={`relative overflow-hidden rounded-3xl mb-5 ${className}`}
            style={{ background: colors.surface, border: `1px solid ${colors.border}`, boxShadow: '0 10px 30px -12px rgba(249,115,22,0.45)' }}
        >
            <div aria-hidden className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #f97316, #dc2626, #f97316)' }} />
            <div aria-hidden className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.22), transparent 70%)' }} />
            <div className="relative p-4">
                <div className="flex items-center gap-3">
                    <span
                        className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 text-white"
                        style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)', boxShadow: '0 6px 16px -6px rgba(220,38,38,0.6)' }}
                    >
                        <Wrench size={22} />
                    </span>
                    <div className="min-w-0">
                        <span className="inline-block text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full text-white mb-1" style={{ background: 'linear-gradient(90deg, #f97316, #dc2626)' }}>
                            Voltamos já
                        </span>
                        <h2 className="text-base font-black leading-tight" style={{ color: colors.textPrimary }}>{TITLE}</h2>
                    </div>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed" style={{ color: colors.textSecondary }}>{MESSAGE}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {HIGHLIGHTS.map(({ icon: Icon, label }) => (
                        <span
                            key={label}
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-full"
                            style={{ color: colors.textPrimary, background: 'rgba(249,115,22,0.10)', border: '1px solid rgba(249,115,22,0.30)' }}
                        >
                            <Icon size={13} style={{ color: '#f97316' }} />
                            {label}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    )
}
