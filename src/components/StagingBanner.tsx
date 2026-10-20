// src/components/StagingBanner.tsx
//
// Faixa fixa "AMBIENTE DE TESTE" (laranja iUser: o Safari pinta a barra do navegador com a cor do que está fixo na borda da tela) só quando NEXT_PUBLIC_APP_ENV=staging (projeto/branch de teste na Vercel, banco Supabase
// separado). Em produção não renderiza nada. Serve para ninguém confundir o teste com o app de verdade.
export default function StagingBanner() {
    if (process.env.NEXT_PUBLIC_APP_ENV !== 'staging') return null
    // as telas de altura fixa (comunidades) sobem esta altura para o campo de mensagem não ficar atrás da faixa
    return (
        <>
        <style>{':root{--staging-banner-h:24px}'}</style>
        <div
            role="status"
            style={{
                position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 2147483647, pointerEvents: 'none',
                background: '#f97316', color: '#fff', textAlign: 'center', fontSize: 11, fontWeight: 800,
                letterSpacing: 0.4, padding: '3px 8px', paddingBottom: 'max(3px, env(safe-area-inset-bottom))',
            }}
        >
            AMBIENTE DE TESTE — dados fictícios, nada aqui é real
        </div>
        </>
    )
}
