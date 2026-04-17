'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { User, Layers } from 'lucide-react'

export function DownlineTree({ userId }: { userId: string }) {
    const supabase = createClient()

    const { data: downlines, isLoading, error } = useQuery({
        queryKey: ['downlines', userId],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_downline', { parent_id: userId })
            if (error) throw error
            return data
        }
    })

    if (isLoading) return <div className="text-neutral-400 p-4">Carregando arvore...</div>
    if (error) return <div className="text-red-500 p-4">Erro ao carregar rede.</div>

    if (!downlines || downlines.length === 0) {
        return (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center text-neutral-500">
                Ninguém na sua rede ainda. Compartilhe seu link!
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {downlines.map((user: any) => (
                <div key={user.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center border border-neutral-700 overflow-hidden">
                            {user.avatar_url ? (
                                <img src={user.avatar_url} className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-5 h-5 text-neutral-500" />
                            )}
                        </div>
                        <div>
                            <p className="font-bold text-white leading-tight">{user.name}</p>
                            <p className="text-xs text-neutral-500 mt-0.5">Entrou em: {new Date(user.created_at).toLocaleDateString('pt-BR')}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-950 rounded-lg border border-neutral-800">
                        <Layers className="w-4 h-4 text-neutral-400" />
                        <span className="text-sm font-semibold text-neutral-300">Nível {user.level}</span>
                    </div>
                </div>
            ))}
        </div>
    )
}