// src/components/v3/DriverSkeleton.tsx
//
// Esqueleto da PÁGINA DO MOTORISTA (perfil do tipo Motorista): a capa, a foto no centro, nome, @, os ícones do veículo, os três números,
// o botão de solicitar corrida, as abas e duas avaliações. É o MESMO desenho do começo ao fim do carregamento — antes de saber de quem
// é o endereço (`OwnerSkeleton`, quando este aparelho já viu que é de motorista), enquanto o perfil carrega e enquanto os dados do
// motorista chegam (`DriverProfile`) —, para a página não trocar de forma no meio. `standalone` = sozinho na página (com o voltar).
'use client'

import { useTheme } from '@/app/contexts/theme'

export default function DriverSkeleton({ standalone = false }: { standalone?: boolean }) {
    const { colors } = useTheme()
    const sk = { background: `${colors.border}55` }
    const body = (
        <>
            <section className="rounded-[28px] overflow-hidden" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <div className="h-40 animate-pulse" style={sk} />
                <div className="px-4 pb-4 -mt-11 flex flex-col items-center">
                    <div className="w-[92px] h-[92px] rounded-full animate-pulse" style={{ ...sk, boxShadow: `0 0 0 4px ${colors.surface}` }} />
                    <div className="mt-3 h-5 w-44 rounded-full animate-pulse" style={sk} />
                    <div className="mt-2 h-3 w-28 rounded-full animate-pulse" style={sk} />
                    <div className="mt-3 flex gap-1.5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-5 w-11 rounded-full animate-pulse" style={sk} />)}</div>
                    <div className="mt-3 w-full grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 rounded-2xl animate-pulse" style={sk} />)}</div>
                    <div className="mt-3 w-full h-11 rounded-full animate-pulse" style={sk} />
                </div>
            </section>
            <div className="mt-4 h-[62px] rounded-[22px] animate-pulse" style={sk} />
            <div className="mt-5 h-12 rounded-[20px] animate-pulse" style={sk} />
            {[0, 1].map((i) => <div key={i} className="mt-3 h-24 rounded-3xl animate-pulse" style={sk} />)}
        </>
    )
    if (!standalone) return <div className="pb-10" aria-busy="true" aria-label="Carregando o perfil do motorista">{body}</div>
    // sozinho na página: a mesma moldura do perfil (o voltar em cima e a margem de sempre)
    return (
        <div aria-busy="true" aria-label="Carregando o perfil do motorista" className="w-full px-4 md:px-6 py-4 md:max-w-3xl md:mx-auto" style={{ background: colors.background }}>
            <span className="block w-[46px] h-[46px] rounded-full animate-pulse mb-4" style={sk} />
            {body}
        </div>
    )
}
