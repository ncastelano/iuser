'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Save, LogOut } from 'lucide-react'
import { useThemeStore } from '@/store/useThemeStore'

export default function ConfiguracoesPage() {
    const router = useRouter()
    const supabase = createClient()

    const { theme, setTheme } = useThemeStore()
    const [whatsapp, setWhatsapp] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        async function loadProfile() {
            const { data: { user } } = await supabase.auth.getUser()

            if (user) {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('whatsapp, theme_mode')
                    .eq('id', user.id)
                    .single()

                if (error) {
                    console.error('[Configuracoes] Erro ao carregar:', error)
                }

                if (data?.whatsapp) {
                    setWhatsapp(data.whatsapp)
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
            const { error } = await supabase
                .from('profiles')
                .update({
                    whatsapp: normalizedWhatsapp || null,
                    theme_mode: 'light'
                })
                .eq('id', user.id)

            if (error) {
                console.error('[Configuracoes] Erro ao salvar:', error)
                alert(`Erro ao salvar: ${error.message}`)
            } else {
                setWhatsapp(normalizedWhatsapp)
                setTheme('light') // Sincroniza o estado global para garantir light mode
                alert('Configurações salvas com sucesso!')
            }
        }

        setSaving(false)
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.replace('/')

        setTimeout(() => {
            window.location.href = '/'
        }, 100)
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex justify-center items-center text-foreground font-sans">
                Carregando...
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans selection:bg-primary selection:text-primary-foreground">
            <div className="max-w-2xl mx-auto space-y-10 mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Header */}
                <div className="flex items-center gap-6 border-b border-border pb-8">
                    <button
                        onClick={() => router.back()}
                        className="w-12 h-12 flex items-center justify-center bg-secondary/50 border border-border rounded-2xl hover:bg-secondary transition-all active:scale-95"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </button>

                    <div>
                        <h1 className="text-4xl font-black italic uppercase tracking-tighter leading-none">
                            Configurações<span className="text-primary">.</span>
                        </h1>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground mt-1">
                            Configure sua experiência no iUser
                        </p>
                    </div>
                </div>

                {/* Card */}
                <div className="bg-card/40 backdrop-blur-xl p-8 rounded-[40px] border border-border shadow-2xl space-y-8">

                    {/* WhatsApp */}
                    <div className="space-y-4">
                        <label className="block text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                            Seu WhatsApp
                        </label>

                        <p className="text-xs text-muted-foreground/80 font-medium leading-relaxed">
                            Cadastre seu número para receber extratos de vendas e avisos de pedidos em tempo real diretamente no seu celular.
                        </p>

                        <div className="bg-primary/5 border border-primary/20 p-5 rounded-3xl">
                            <p className="text-[10px] text-primary font-black uppercase tracking-[0.2em] mb-1">
                                Atenção Lojista:
                            </p>
                            <p className="text-[11px] text-muted-foreground font-medium leading-normal">
                                Ao clicar em comprar, o cliente enviará os detalhes do pedido para este número. Mantenha-o sempre atualizado!
                            </p>
                        </div>

                        <input
                            type="text"
                            placeholder="(00) 00000-0000"
                            value={whatsapp}
                            onChange={(e) => setWhatsapp(e.target.value)}
                            inputMode="tel"
                            className="w-full bg-secondary/30 border border-border px-6 py-4 rounded-2xl text-foreground font-bold outline-none focus:border-primary transition-all placeholder:text-muted-foreground/30"
                        />
                    </div>



                    {/* Save */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full py-5 bg-foreground text-background font-black uppercase text-[11px] tracking-[0.3em] flex items-center justify-center gap-3 rounded-[24px] hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50 shadow-2xl"
                    >
                        {saving ? (
                            'Guardando...'
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                Salvar Alterações
                            </>
                        )}
                    </button>
                </div>

                {/* Logout */}
                <div className="pt-4 px-4">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-8 py-5 bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20 rounded-[28px] font-black uppercase text-[10px] tracking-[0.3em] transition-all w-full justify-center group"
                    >
                        <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        Sair da conta
                    </button>
                </div>
            </div>
        </div>
    )
}
