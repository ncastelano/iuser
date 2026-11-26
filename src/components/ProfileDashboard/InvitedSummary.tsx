'use client'
// src/components/ProfileDashboard/InvitedSummary.tsx — "Meus convidados" no painel do perfil: quem entrou pelo meu link e a pontuação de
// cada um, SEM precisar abrir a página de convidados. Dados: get_my_invitees (só quem tem upline = eu). Ver detalhes → /convidados.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useTheme } from '@/app/contexts/theme'

interface Invitee { id: string; name: string | null; profile_slug: string | null; avatar_url: string | null; joined_at: string | null; points: number }

export default function InvitedSummary({ userId }: { userId: string }) {
    const { colors } = useTheme()
    const router = useRouter()
    const [list, setList] = useState<Invitee[] | null>(null)

    useEffect(() => {
        let alive = true
        void supabase.rpc('get_my_invitees', { p_limit: 50 }).then(({ data, error }) => {
            if (!alive) return
            setList(error ? [] : ((data as Invitee[]) || []))
        })
        return () => { alive = false }
    }, [userId])

    const total = list?.length ?? 0
    const totalPoints = (list || []).reduce((a, i) => a + (Number(i.points) || 0), 0)
    const shown = (list || []).slice(0, 5)

    return (
        <div className="mb-3 rounded-2xl p-4" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#7c3aed1a', color: '#7c3aed' }}><UserPlus size={18} /></span>
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-black" style={{ color: colors.textPrimary }}>Meus convidados</p>
                    <p className="text-[12px]" style={{ color: colors.textSecondary }}>
                        {list === null ? 'Carregando…' : total === 0 ? 'Você ainda não convidou ninguém' : `${total} ${total === 1 ? 'pessoa entrou' : 'pessoas entraram'} pelo seu link · ${totalPoints} pontos no total`}
                    </p>
                </div>
            </div>

            {shown.length > 0 && (
                <ul className="mt-3 flex flex-col divide-y" style={{ borderColor: colors.border }}>
                    {shown.map((i) => (
                        <li key={i.id} className="py-2 flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0 text-[12px] font-black" style={{ background: `${colors.border}60`, color: colors.textSecondary }}>
                                {i.avatar_url ? <img src={i.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" /> : (i.name || '?').charAt(0).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-black truncate" style={{ color: colors.textPrimary }}>{i.name || 'Usuário'}</span>
                                {i.profile_slug && <span className="block text-[11px] truncate" style={{ color: colors.textSecondary }}>@{i.profile_slug}</span>}
                            </span>
                            <span className="text-right flex-shrink-0">
                                <span className="block text-[13px] font-black" style={{ color: '#7c3aed' }}>{i.points} pts</span>
                                {i.joined_at && <span className="block text-[10.5px]" style={{ color: colors.textSecondary }}>{new Date(i.joined_at).toLocaleDateString('pt-BR')}</span>}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            <button onClick={() => router.push('/convidados')} className="mt-3 w-full h-10 rounded-xl text-[13px] font-black flex items-center justify-center gap-1" style={{ background: `${colors.border}40`, color: colors.textPrimary }}>
                {total > 0 ? `Ver todos e os detalhes` : 'Convidar e ver a rede'} <ChevronRight size={16} />
            </button>
        </div>
    )
}
