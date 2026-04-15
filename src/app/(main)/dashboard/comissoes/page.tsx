'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, DollarSign, Receipt } from 'lucide-react'

export default function ComissoesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [commissions, setCommissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    async function fetchCommissions() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Fetch sum
      const { data: commTotal } = await supabase.rpc('get_total_commissions', { user_id: user.id })
      setTotal(commTotal || 0)

      // Fetch list
      const { data } = await supabase
        .from('commissions')
        .select('*, sales(*, user_id)')
        .eq('earner_id', user.id)
        .order('created_at', { ascending: false })

      if (data) setCommissions(data)
      setLoading(false)
    }

    fetchCommissions()
  }, [])

  if (loading) return <div className="min-h-screen bg-black text-white flex justify-center items-center">Aguarde...</div>

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto mt-8">
        <Link href="/dashboard" className="flex items-center gap-2 text-neutral-400 hover:text-white transition mb-6 w-fit">
          <ArrowLeft className="w-5 h-5" /> Voltar para o Painel
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
              <DollarSign className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-white">Extrato</h1>
              <p className="text-neutral-400">Total recebido: <span className="text-white font-bold">R$ {total.toFixed(2).replace('.', ',')}</span></p>
            </div>
          </div>
        </div>

        {commissions.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-10 text-center flex flex-col items-center gap-3">
            <Receipt className="w-12 h-12 text-neutral-600" />
            <p className="text-neutral-500">Você ainda não recebeu comissões.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {commissions.map((comm) => (
              <div key={comm.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex items-center justify-between shadow-md">
                <div>
                  <p className="text-sm text-neutral-400">Recebido de uma venda na rede (Nível {comm.level})</p>
                  <p className="text-xs text-neutral-500 mt-1">{new Date(comm.created_at).toLocaleString('pt-BR')}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-extrabold text-green-400">+ R$ {comm.amount.toFixed(2).replace('.', ',')}</p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
