'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ShoppingCart, CheckCircle } from 'lucide-react'

export default function TesteVendaPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const simulateSale = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    // Inserir venda na tabela sales. O valor de commission_pool padrão é 1.00
    // O Trigger cuidará de pagar $1 distribuído na rede.
    const { error } = await supabase.from('sales').insert({
      user_id: user.id,
      amount: 100.00, // Fazendo de conta que comprou um produto de 100 reais
    })

    if (error) {
      alert('Erro ao processar venda simulada: ' + error.message)
    } else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 5000)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-md mx-auto mt-16 text-center">
        <Link href="/dashboard" className="flex items-center justify-center gap-2 text-neutral-400 hover:text-white transition mb-8">
          <ArrowLeft className="w-5 h-5" /> Voltar
        </Link>

        <div className="w-20 h-20 bg-neutral-900 border border-neutral-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl">
          <ShoppingCart className="w-10 h-10 text-white" />
        </div>

        <h1 className="text-2xl font-bold mb-4">Simulador de Transação</h1>
        <p className="text-neutral-400 mb-8 leading-relaxed">
          Para testar o comissionamento multinível, clique no botão abaixo.
          O sistema criará uma venda falsa em seu nome, disparando as regras e comissionando seus "uplines" em 5 níveis se existirem.
        </p>

        {success && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-400 p-4 rounded-xl mb-6 flex items-center justify-center gap-2">
            <CheckCircle className="w-5 h-5" /> Venda simulada e comissões processadas!
          </div>
        )}

        <button
          onClick={simulateSale}
          disabled={loading}
          className="w-full bg-white text-black py-4 rounded-xl font-bold text-lg hover:bg-neutral-200 transition-all disabled:opacity-50"
        >
          {loading ? 'Processando...' : 'Comprar Produto Teste (R$ 100,00)'}
        </button>

      </div>
    </div>
  )
}
