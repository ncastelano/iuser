'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Network } from 'lucide-react'
import { DownlineTree } from './DownlineTree'

export default function RedePage() {
    const router = useRouter()
    const supabase = createClient()
    const [userId, setUserId] = useState<string | null>(null)
    const [networkCounts, setNetworkCounts] = useState<{ level: number, count: string }[]>([])

    useEffect(() => {
        async function loadUser() {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) {
                router.push('/login')
                return
            }
            setUserId(user.id)

            const { data } = await supabase.rpc('get_network_counts', { p_user_id: user.id })
            if (data) setNetworkCounts(data)
        }
        loadUser()
    }, [])

    if (!userId) {
        return <div className="min-h-screen bg-black text-white flex items-center justify-center">Aguarde...</div>
    }

    // Preencher níveis de 1 a 5
    const levelsData = [1, 2, 3, 4, 5].map(lvl => {
        const found = networkCounts.find(n => n.level === lvl)
        return { level: lvl, count: found ? parseInt(found.count) : 0 }
    })

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-8">
            <div className="max-w-4xl mx-auto mt-8">
                <Link href="/dashboard" className="flex items-center gap-2 text-neutral-400 hover:text-white transition mb-6 w-fit">
                    <ArrowLeft className="w-5 h-5" /> Voltar para o Painel
                </Link>

                <div className="flex items-center gap-3 mb-8">
                    <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                        <Network className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-extrabold text-white">Minha Rede</h1>
                        <p className="text-neutral-400">Total de pessoas por nível de profundidade</p>
                    </div>
                </div>

                {/* Níveis Overview */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-10">
                    {levelsData.map(lvl => (
                        <div key={lvl.level} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center">
                            <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest mb-1">Nível {lvl.level}</p>
                            <p className="text-2xl font-extrabold text-white">{lvl.count}</p>
                        </div>
                    ))}
                </div>

                <h2 className="text-xl font-bold mb-4">Membros da Rede</h2>
                <DownlineTree userId={userId} />

            </div>
        </div>
    )
}