'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ConfiguracoesPage() {
    const router = useRouter()

    const handleLogout = async () => {
        const supabase = createClient()

        await supabase.auth.signOut()

        // 🔥 remove histórico (não dá pra voltar)
        router.replace('/login')

        // 🔒 força reload limpando estado
        setTimeout(() => {
            window.location.href = '/login'
        }, 100)
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white">
            <button
                onClick={handleLogout}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-xl font-bold transition-all"
            >
                Sair da conta
            </button>
        </div>
    )
}
