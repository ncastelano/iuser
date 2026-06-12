// src/app/(main)/Configuracoes.tsx
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Save, LogOut, Type, Bell, Smartphone, Sparkles } from 'lucide-react'
import { useFontStore } from '@/store/useFontStore'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface ConfiguracoesProps {
    onBack: () => void
}

export default function ConfiguracoesContent({ onBack }: ConfiguracoesProps) {
    const router = useRouter()

    const [whatsapp, setWhatsapp] = useState('')
    const [useWhatsapp, setUseWhatsapp] = useState(true)
    const { fontSize, setFontSize } = useFontStore()
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
                    setUseWhatsapp(true)
                } else {
                    setUseWhatsapp(false)
                }
            }

            setLoading(false)
        }

        loadProfile()
    }, [])

    const handleSave = async () => {
        setSaving(true)

        const normalizedWhatsapp = useWhatsapp ? whatsapp.replace(/[^\d+]/g, '').trim() : null

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
                toast.error(`Erro ao salvar: ${error.message}`)
            } else {
                setWhatsapp(normalizedWhatsapp || '')
                toast.success('Configurações salvas com sucesso!')
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
            <div className="relative z-10 flex flex-col items-center justify-center py-20">
                <div className="w-10 h-10 border-3 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-wider text-white/60 mt-4 animate-pulse">
                    Carregando configurações...
                </p>
            </div>
        )
    }

    return (
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 pb-24">
            {/* Header da seção */}
            <div className="mb-8 text-center">
                <div className="inline-flex items-center gap-2 bg-purple-500/20 text-purple-300 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider mb-4 shadow-md">
                    <Sparkles size={12} />
                    Personalize sua experiência
                </div>
                <h1 className="text-4xl font-black italic uppercase tracking-tighter bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
                    Configurações
                </h1>
                <p className="text-sm text-white/60 mt-2">
                    Ajuste o app do seu jeito
                </p>
            </div>

            {/* Cards de Configuração - Tema escuro */}
            <div className="space-y-6">

                {/* WhatsApp Card */}
                <div className="rounded-2xl p-6 border shadow-sm hover:shadow-md transition-shadow"
                    style={{
                        background: 'rgba(255,255,255,0.06)',
                        backdropFilter: 'blur(12px)',
                        borderColor: 'rgba(255,255,255,0.1)'
                    }}
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                                <Smartphone className="w-5 h-5 text-green-400" />
                            </div>
                            <div>
                                <h3 className="text-base font-black uppercase tracking-tighter text-white">
                                    WhatsApp
                                </h3>
                                <p className="text-[9px] font-black text-white/50 uppercase tracking-wider">
                                    Notificações em tempo real
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => setUseWhatsapp(!useWhatsapp)}
                            className={`relative w-12 h-6 rounded-full transition-all ${useWhatsapp ? 'bg-green-500' : 'bg-gray-600'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${useWhatsapp ? 'right-1' : 'left-1'}`} />
                        </button>
                    </div>

                    {useWhatsapp && (
                        <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                            <div className="rounded-xl p-4 border"
                                style={{
                                    background: 'rgba(16,185,129,0.1)',
                                    borderColor: 'rgba(16,185,129,0.2)'
                                }}
                            >
                                <p className="text-[9px] font-black text-green-400 uppercase tracking-wider mb-1">
                                    ✨ Receba alertas no celular
                                </p>
                                <p className="text-xs text-white/70 leading-relaxed">
                                    Quando um cliente comprar na sua loja, você receberá os detalhes do pedido diretamente no WhatsApp.
                                </p>
                            </div>

                            <div>
                                <label className="block text-[9px] font-black uppercase tracking-wider text-white/60 mb-2">
                                    Seu número com DDD
                                </label>
                                <input
                                    type="tel"
                                    placeholder="(00) 00000-0000"
                                    value={whatsapp}
                                    onChange={(e) => setWhatsapp(e.target.value)}
                                    className="w-full px-5 py-4 rounded-xl text-white placeholder:text-white/30 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                                    style={{
                                        background: 'rgba(255,255,255,0.1)',
                                        border: '1px solid rgba(255,255,255,0.2)'
                                    }}
                                />
                                <p className="text-[8px] text-white/40 mt-2">
                                    Exemplo: (11) 99999-9999
                                </p>
                            </div>
                        </div>
                    )}

                    {!useWhatsapp && (
                        <div className="rounded-xl p-4 border text-center"
                            style={{
                                background: 'rgba(255,255,255,0.06)',
                                borderColor: 'rgba(255,255,255,0.1)'
                            }}
                        >
                            <Bell className="w-6 h-6 text-white/40 mx-auto mb-2" />
                            <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider">
                                Notificações apenas no app
                            </p>
                            <p className="text-[9px] text-white/40 mt-1">
                                Você verá os pedidos na aba Painel
                            </p>
                        </div>
                    )}
                </div>

                {/* Tamanho da Fonte Card */}
                <div className="rounded-2xl p-6 border shadow-sm hover:shadow-md transition-shadow"
                    style={{
                        background: 'rgba(255,255,255,0.06)',
                        backdropFilter: 'blur(12px)',
                        borderColor: 'rgba(255,255,255,0.1)'
                    }}
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                            <Type className="w-5 h-5 text-purple-400" />
                        </div>
                        <div>
                            <h3 className="text-base font-black uppercase tracking-tighter text-white">
                                Tamanho da Fonte
                            </h3>
                            <p className="text-[9px] font-black text-white/50 uppercase tracking-wider">
                                Para melhor leitura
                            </p>
                        </div>
                    </div>

                    <p className="text-xs text-white/60 mb-4">
                        Aumente ou diminua o tamanho dos textos em todo o aplicativo.
                    </p>

                    <div className="grid grid-cols-3 gap-3">
                        <button
                            onClick={() => setFontSize('normal')}
                            className={`py-3 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all ${fontSize === 'normal'
                                ? 'bg-purple-500 text-white shadow-md'
                                : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
                                }`}
                        >
                            Padrão
                        </button>
                        <button
                            onClick={() => setFontSize('large')}
                            className={`py-3 rounded-xl font-black uppercase text-[11px] tracking-wider transition-all ${fontSize === 'large'
                                ? 'bg-purple-500 text-white shadow-md'
                                : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
                                }`}
                        >
                            Grande
                        </button>
                        <button
                            onClick={() => setFontSize('extra-large')}
                            className={`py-3 rounded-xl font-black uppercase text-[12px] tracking-wider transition-all ${fontSize === 'extra-large'
                                ? 'bg-purple-500 text-white shadow-md'
                                : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
                                }`}
                        >
                            Enorme
                        </button>
                    </div>

                    <div className="mt-4 p-3 rounded-xl border"
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            borderColor: 'rgba(255,255,255,0.1)'
                        }}
                    >
                        <p className={`text-white/60 ${fontSize === 'normal' ? 'text-sm' : fontSize === 'large' ? 'text-base' : 'text-lg'}`}>
                            🔤 Exemplo de texto com esta fonte
                        </p>
                    </div>
                </div>

                {/* Botão Salvar */}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="group relative w-full bg-purple-600 text-white py-4 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                        {saving ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                Salvar Configurações
                            </>
                        )}
                    </span>
                </button>

                {/* Botão Sair */}
                <button
                    onClick={handleLogout}
                    className="group w-full bg-red-500/20 border-2 border-red-500/40 text-red-400 py-4 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:bg-red-500 hover:text-white hover:border-red-500 hover:shadow-lg active:scale-95"
                >
                    <span className="flex items-center justify-center gap-2">
                        <LogOut className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                        Sair da Conta
                    </span>
                </button>

                {/* Versão do App */}
                <div className="text-center pt-4">
                    <p className="text-[8px] font-black uppercase tracking-wider text-white/30">
                        iUser • Versão 07.05.2026
                    </p>
                    <p className="text-[7px] text-white/20 mt-1">
                        Mostre ao mundo o que você tem de melhor
                    </p>
                </div>
            </div>
        </div>
    )
}