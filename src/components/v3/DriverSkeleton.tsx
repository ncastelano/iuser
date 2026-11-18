// src/components/v3/DriverSkeleton.tsx
//
// Esqueleto da PÁGINA DO MOTORISTA (perfil do tipo Motorista), na mesma forma dela: a imagem alta (2/3 do cartão) com o voltar e a situação em
// cima e, embaixo, a foto à esquerda e o nome à direita; o 1/3 de baixo com os ícones, os números e o botão; depois o "Solicitar corrida", as
// abas e duas avaliações. É o MESMO desenho do começo ao fim do carregamento — antes de saber de quem é o endereço (`OwnerSkeleton`, quando
// este aparelho já viu que é de motorista), enquanto o perfil carrega e enquanto os dados do motorista chegam (`DriverProfile`) —, para a
// página não trocar de forma no meio. `standalone` = sozinho na página (a mesma margem do perfil; o voltar fica dentro da imagem).
'use client'

import { useTheme } from '@/app/contexts/theme'

export default function DriverSkeleton({ standalone = false }: { standalone?: boolean }) {
    const { colors } = useTheme()
    const sk = { background: `${colors.border}55` }
    const body = (
        <>
            <section className="rounded-[28px] overflow-hidden" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
                <div className="relative h-[300px] animate-pulse" style={sk}>
                    <span className="absolute left-3 top-3 w-10 h-10 rounded-full" style={{ background: `${colors.border}aa` }} />
                    <span className="absolute right-3 top-3 w-32 h-8 rounded-full" style={{ background: `${colors.border}aa` }} />
                    <span aria-hidden className="absolute inset-x-0 bottom-0 h-[58%]" style={{ background: `linear-gradient(to bottom, transparent, ${colors.surface})` }} />
                    <div className="absolute left-4 right-4 bottom-3 flex items-end gap-3">
                        <span className="w-[92px] h-[92px] rounded-full flex-shrink-0" style={{ background: `${colors.border}aa`, boxShadow: `0 0 0 4px ${colors.surface}` }} />
                        <div className="flex-1 flex flex-col gap-2 pb-1">
                            <span className="h-5 w-3/4 rounded-full" style={{ background: `${colors.border}aa` }} />
                            <span className="h-3 w-1/2 rounded-full" style={{ background: `${colors.border}aa` }} />
                            <span className="h-6 w-2/3 rounded-full" style={{ background: `${colors.border}aa` }} />
                        </div>
                    </div>
                </div>
                <div className="px-4 pb-4 pt-1 flex flex-col gap-2.5">
                    <div className="flex gap-1.5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-5 w-11 rounded-full animate-pulse" style={sk} />)}</div>
                    <div className="h-4 w-3/4 rounded-full animate-pulse" style={sk} />
                    <div className="h-10 w-full rounded-full animate-pulse" style={sk} />
                </div>
            </section>
            <div className="mt-4 h-[62px] rounded-[22px] animate-pulse" style={sk} />
            <div className="mt-5 h-12 rounded-[20px] animate-pulse" style={sk} />
            {[0, 1].map((i) => <div key={i} className="mt-3 h-24 rounded-3xl animate-pulse" style={sk} />)}
        </>
    )
    if (!standalone) return <div className="pb-10" aria-busy="true" aria-label="Carregando o perfil do motorista">{body}</div>
    return (
        <div aria-busy="true" aria-label="Carregando o perfil do motorista" className="w-full px-4 md:px-6 pt-0 pb-4 md:max-w-3xl md:mx-auto" style={{ background: colors.background }}>
            {body}
        </div>
    )
}
