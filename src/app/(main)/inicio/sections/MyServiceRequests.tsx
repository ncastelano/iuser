// src/app/(main)/inicio/sections/MyServiceRequests.tsx
//
// Seção da home "Seus pedidos": os pedidos de serviço em aberto que a própria
// pessoa fez (com quem se candidatou) e os serviços em que ela se inscreveu
// como profissional. Sem nenhum dos dois, o card nem aparece. Enquanto tem
// coisa andando, avisa a home (onUrgentChange) pra subir o card pra perto do topo.
'use client'

import { ReactNode, useEffect, useState } from 'react'
import MyOpenServiceRequests from '@/components/MyOpenServiceRequests'
import { useMyServiceApplications } from '@/hooks/useMyServiceApplications'
import MyServiceApplications from './MyServiceApplications'

interface MyServiceRequestsProps {
    dragHandle?: ReactNode
    onUrgentChange?: (urgent: boolean) => void
}

export default function MyServiceRequests({ dragHandle, onUrgentChange }: MyServiceRequestsProps) {
    const { items: myApplications } = useMyServiceApplications()
    const [myOpenCount, setMyOpenCount] = useState(0)
    const hasActivity = myOpenCount > 0 || myApplications.some((a) => a.status !== 'rejected')
    const hasAnything = myOpenCount > 0 || myApplications.length > 0

    useEffect(() => { onUrgentChange?.(hasActivity) }, [hasActivity, onUrgentChange])

    // Os filhos ficam montados mesmo escondidos: é o MyOpenServiceRequests que
    // descobre se há pedidos (onCountChange). Em modo de edição (dragHandle) o
    // card aparece sempre, pra dar pra reordenar.
    const visible = hasAnything || !!dragHandle

    return (
        <section className={visible ? undefined : 'hidden'}>
            <div>
                {dragHandle && <div className="flex mb-2">{dragHandle}</div>}

                <MyOpenServiceRequests limit={3} title="Seus pedidos em aberto" onCountChange={setMyOpenCount} />

                {myApplications.length > 0 && (
                    <div className={myOpenCount > 0 ? 'mt-6' : undefined}>
                        <MyServiceApplications items={myApplications} />
                    </div>
                )}
            </div>
        </section>
    )
}
