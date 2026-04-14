'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CopyLinkButton } from './CopyLinkButton'
import { Users, DollarSign, ArrowLeft, Network, ShoppingBag } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [totalCommissions, setTotalCommissions] = useState(0)
  const [networkCount, setNetworkCount] = useState(0)

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileData) {
        setProfile(profileData)
      }

      // Fetch commissions
      const { data: commTotal, error: commError } = await supabase.rpc('get_total_commissions', { user_id: user.id })
      if (!commError && commTotal !== null) {
        setTotalCommissions(commTotal)
      }

      // Fetch network counts
      const { data: netCounts, error: netError } = await supabase.rpc('get_network_counts', { p_user_id: user.id })
      if (!netError && netCounts) {
        const total = netCounts.reduce((acc: number, item: any) => acc + parseInt(item.count), 0)
        setNetworkCount(total)
      }

      setLoading(false)
    }
    loadData()
  }, [router])

  if (loading) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center">Carregando painel...</div>
  }

  const referralLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/${profile?.profileSlug}`

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto mt-8">
        <button onClick={() => router.push('/perfil')} className="flex items-center gap-2 text-neutral-400 hover:text-white transition mb-6">
          <ArrowLeft className="w-5 h-5" /> Voltar para o Perfil
        </button>

        <h1 className="text-3xl font-extrabold mb-2">Painel de Afiliado</h1>
        <p className="text-neutral-400 mb-8">Gerencie sua rede e acompanhe seus ganhos.</p>

        {/* Link Section */}
        <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between shadow-xl">
          <div>
            <p className="text-sm text-neutral-400 mb-1 font-semibold uppercase tracking-widest">Seu Link de Convite</p>
            <p className="font-bold text-white max-w-sm truncate">{referralLink}</p>
          </div>
          <CopyLinkButton link={referralLink} />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-2xl shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-400">
                <DollarSign className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg text-neutral-300">Ganhos Totais</h3>
            </div>
            <p className="text-4xl font-extrabold text-white mt-4">
              R$ {totalCommissions.toFixed(2).replace('.', ',')}
            </p>
            <Link href="/dashboard/comissoes" className="text-sm text-green-400 hover:text-green-300 mt-4 inline-block font-semibold">
              Ver Extrato &rarr;
            </Link>
          </div>

          <div className="bg-neutral-900/50 border border-neutral-800 p-6 rounded-2xl shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg text-neutral-300">Sua Rede</h3>
            </div>
            <p className="text-4xl font-extrabold text-white mt-4">
              {networkCount} <span className="text-xl text-neutral-500 font-medium tracking-normal">pessoas</span>
            </p>
            <Link href="/dashboard/rede" className="text-sm text-blue-400 hover:text-blue-300 mt-4 inline-block font-semibold">
              Ver Downlines &rarr;
            </Link>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/dashboard/rede" className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl hover:border-white/20 transition flex flex-col items-center justify-center text-center gap-3">
            <Network className="w-8 h-8 text-neutral-400" />
            <span className="font-bold text-white">Minha Rede Completa</span>
          </Link>
          <Link href="/dashboard/teste-venda" className="bg-neutral-900 border border-neutral-800 p-6 rounded-2xl hover:border-white/20 transition flex flex-col items-center justify-center text-center gap-3">
            <ShoppingBag className="w-8 h-8 text-neutral-400" />
            <span className="font-bold text-neutral-400">Simular Venda (Teste)</span>
          </Link>
        </div>

      </div>
    </div>
  )
}
