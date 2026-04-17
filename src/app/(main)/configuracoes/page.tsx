'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Save, LogOut } from 'lucide-react'

export default function ConfiguracoesPage() {
    const router = useRouter()
    const supabase = createClient()
    const [whatsapp, setWhatsapp] = useState('')
    const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        async function loadProfile() {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data, error } = await supabase.from('profiles').select('whatsapp, theme_mode').eq('id', user.id).single()
                if (error) {
                    console.error('[Configuracoes] Erro ao carregar WhatsApp:', error)
                }
                if (data?.whatsapp) {
                    setWhatsapp(data.whatsapp)
                }
                if (data?.theme_mode) {
                    setThemeMode(data.theme_mode as 'dark' | 'light')
                }
            }
            setLoading(false)
        }
        loadProfile()
    }, [])

    const handleSave = async () => {
        setSaving(true)
        const normalizedWhatsapp = whatsapp.replace(/[^\d+]/g, '').trim()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            const { error } = await supabase.from('profiles').update({ 
                whatsapp: normalizedWhatsapp || null,
                theme_mode: themeMode
            }).eq('id', user.id)
            if (error) {
                console.error('[Configuracoes] Erro ao salvar:', error)
                alert(`Erro ao salvar: ${error.message}`)
            } else {
                setWhatsapp(normalizedWhatsapp)
                alert('Configurações salvas com sucesso!')
            }
        }
        setSaving(false)
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.replace('/login')
        setTimeout(() => {
            window.location.href = '/login'
        }, 100)
    }

    if (loading) return <div className="min-h-screen bg-black flex justify-center items-center">Carregando...</div>

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-8">
            <div className="max-w-2xl mx-auto space-y-6 mt-6">
                <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                    <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center bg-neutral-900 border border-neutral-800 rounded-xl hover:bg-neutral-800 transition">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h1 className="text-2xl font-bold">Configurações</h1>
                </div>

                <div className="bg-neutral-900/60 p-6 rounded-2xl border border-neutral-800 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold text-neutral-300 mb-2">Seu WhatsApp</label>
                        <p className="text-xs text-neutral-500 mb-2 font-medium">Cadastre seu número para receber <span className="text-white">extratos de vendas</span> e avisos de pedidos em tempo real diretamente no seu celular.</p>
                        <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl mb-4">
                            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Atenção Logista:</p>
                            <p className="text-[11px] text-neutral-400 mt-1 leading-tight">Ao clicar em comprar, o cliente enviará os detalhes do pedido para este número. Mantenha-o sempre atualizado!</p>
                        </div>
                        <input
                            type="text"
                            placeholder="(00) 00000-0000"
                            value={whatsapp}
                            onChange={(e) => setWhatsapp(e.target.value)}
                            inputMode="tel"
                            className="w-full bg-neutral-950 border border-neutral-700 px-4 py-3 rounded-xl text-white outline-none focus:border-white transition"
                        />
                    </div>

                    <div className="bg-neutral-900/40 p-5 rounded-2xl border border-white/5 space-y-4">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-neutral-500 mb-3">Preferência Visual</p>
                            <div className="flex bg-black/60 p-1 rounded-xl border border-white/5">
                                <button 
                                    onClick={() => setThemeMode('dark')}
                                    className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${themeMode === 'dark' ? 'bg-white text-black shadow-lg' : 'text-neutral-500 hover:text-white'}`}
                                >
                                    Dark Mode
                                </button>
                                <button 
                                    onClick={() => setThemeMode('light')}
                                    className={`flex-1 py-3 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${themeMode === 'light' ? 'bg-white text-black shadow-lg' : 'text-neutral-500 hover:text-white'}`}
                                >
                                    Light Mode
                                </button>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="py-3 px-6 bg-white text-black font-bold flex items-center justify-center gap-2 rounded-xl hover:bg-neutral-200 transition disabled:opacity-50"
                    >
                        {saving ? 'Salvando...' : <><Save className="w-4 h-4" /> Salvar Alterações</>}
                    </button>
                </div>

                <div className="pt-8">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-6 py-3 bg-red-600/20 text-red-500 hover:bg-red-600/30 border border-red-600/30 rounded-xl font-bold transition-all w-full justify-center"
                    >
                        <LogOut className="w-5 h-5" /> Sair da conta
                    </button>
                </div>
            </div>
        </div>
    )
}
