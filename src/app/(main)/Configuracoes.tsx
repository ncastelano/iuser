// src/app/(main)/Configuracoes.tsx
'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
    ArrowLeft, Save, LogOut, Type, Bell, Smartphone, Sparkles,
    Image, Camera, Check, Palette
} from 'lucide-react'
import { useFontStore } from '@/store/useFontStore'            // ← tema global
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import ColloriUser from '@/components/ColloriUser'             // ← seletor de temas
import { useTheme } from '../theme'
import { LoadingSpinner } from '@/components/LoadingSpinner'

type BgMode = 'animated' | 'black' | 'custom'

interface ConfiguracoesProps {
    onBack: () => void
    bgMode?: BgMode
    setBgMode?: (mode: BgMode) => void
    customBgUrl?: string | null
    setCustomBgUrl?: (url: string | null) => void
    isWhiteBg?: boolean // mantido para compatibilidade
}

export default function ConfiguracoesContent({
    onBack,
    bgMode: propBgMode = 'black',
    setBgMode = () => { },
    customBgUrl: propCustomBgUrl = null,
    setCustomBgUrl = () => { },
}: ConfiguracoesProps) {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Estados locais para background
    const [bgMode, _setBgMode] = useState<BgMode>(propBgMode)
    const [customBgUrl, _setCustomBgUrl] = useState<string | null>(propCustomBgUrl)

    // Perfil
    const [whatsapp, setWhatsapp] = useState('')
    const [useWhatsapp, setUseWhatsapp] = useState(true)
    const { fontSize, setFontSize } = useFontStore()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [uploadingBg, setUploadingBg] = useState(false)

    // Tema (cores dinâmicas)
    const { colors } = useTheme()

    // Sincroniza as props com os estados locais
    useEffect(() => {
        _setBgMode(propBgMode)
    }, [propBgMode])

    useEffect(() => {
        _setCustomBgUrl(propCustomBgUrl)
    }, [propCustomBgUrl])

    useEffect(() => {
        async function loadProfile() {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data } = await supabase
                    .from('profiles')
                    .select('whatsapp')
                    .eq('id', user.id)
                    .single()
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
                    background_mode: bgMode,
                    background_image_url: bgMode === 'custom' ? customBgUrl : null,
                })
                .eq('id', user.id)

            if (error) {
                toast.error(`Erro ao salvar: ${error.message}`)
            } else {
                toast.success('Configurações salvas com sucesso!')
                setBgMode(bgMode)
                setCustomBgUrl(customBgUrl)
            }
        }
        setSaving(false)
        onBack()
    }

    const handleLogout = async () => {
        await supabase.auth.signOut()
        router.replace('/')
        setTimeout(() => { window.location.href = '/' }, 100)
    }

    const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploadingBg(true)
        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `bg-${Date.now()}.${fileExt}`
            const { error: uploadError } = await supabase.storage
                .from('backgrounds')
                .upload(fileName, file, { upsert: true })

            if (uploadError) throw uploadError

            const { data } = supabase.storage.from('backgrounds').getPublicUrl(fileName)
            const url = data.publicUrl
            _setCustomBgUrl(url)
            setCustomBgUrl(url)
        } catch (err: any) {
            toast.error('Erro ao enviar imagem: ' + err.message)
        } finally {
            setUploadingBg(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleBgModeChange = (mode: BgMode) => {
        _setBgMode(mode)
        setBgMode(mode)
    }

    if (loading) {
        return <LoadingSpinner message="Carregando configurações..." />
    }

    const bgOptions = [
        { mode: 'animated' as const, label: 'Animado', icon: Sparkles, desc: 'Partículas coloridas' },
        { mode: 'black' as const, label: 'Sem animação', icon: Palette, desc: 'Fundo sólido' },
        { mode: 'custom' as const, label: 'Sua foto', icon: Camera, desc: 'Sua própria imagem' },
    ]

    return (
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 pb-24">
            {/* Cabeçalho */}
            <div className="mb-8 text-center">
                <div
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider mb-4 shadow-md"
                    style={{ background: colors.accentLight, color: colors.accent }}
                >
                    <Sparkles size={12} />
                    Personalize sua experiência
                </div>
                <h1 className="text-4xl font-black italic uppercase tracking-tighter" style={{ color: colors.textPrimary }}>
                    Configurações
                </h1>
                <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>
                    Ajuste o app do seu jeito
                </p>
            </div>

            <div className="space-y-6">
                {/* ========= NOVO CARD: Tema do iUser ========= */}
                <div
                    className="rounded-2xl p-6 border shadow-sm backdrop-blur-md"
                    style={{ background: colors.surface, borderColor: colors.border }}
                >
                    <ColloriUser />
                </div>

                {/* Plano de Fundo (independente) */}
                <div
                    className="rounded-2xl p-6 border shadow-sm backdrop-blur-md"
                    style={{ background: colors.surface, borderColor: colors.border }}
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: colors.accentLight }}>
                            <Image className="w-5 h-5" style={{ color: colors.accent }} />
                        </div>
                        <div>
                            <h3 className="text-base font-black uppercase tracking-tighter" style={{ color: colors.textPrimary }}>Plano de Fundo</h3>
                            <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Escolha o visual do app</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {bgOptions.map(opt => {
                            const isSelected = bgMode === opt.mode
                            return (
                                <button
                                    key={opt.mode}
                                    onClick={() => handleBgModeChange(opt.mode)}
                                    className="relative flex flex-col items-center gap-1 p-3 rounded-xl border transition-all"
                                    style={{
                                        background: isSelected ? colors.accentLight : colors.background,
                                        borderColor: isSelected ? colors.accent : colors.border,
                                    }}
                                >
                                    {isSelected && (
                                        <div
                                            className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                                            style={{ background: colors.accent }}
                                        >
                                            <Check size={12} color={colors.accentText} />
                                        </div>
                                    )}
                                    <opt.icon size={20} color={isSelected ? colors.accent : colors.textSecondary} />
                                    <span className="text-xs font-bold" style={{ color: isSelected ? colors.textPrimary : colors.textSecondary }}>{opt.label}</span>
                                    <span className="text-[9px]" style={{ color: colors.textSecondary }}>{opt.desc}</span>
                                </button>
                            )
                        })}
                    </div>

                    {bgMode === 'custom' && (
                        <div className="mt-3">
                            <input type="file" ref={fileInputRef} onChange={handleBgUpload} accept="image/*" style={{ display: 'none' }} id="bg-upload-input" />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingBg}
                                className="w-full py-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2"
                                style={{ background: colors.background, borderColor: colors.border, color: colors.textSecondary }}
                            >
                                {uploadingBg ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Camera size={14} />
                                )}
                                {customBgUrl ? 'Trocar imagem' : 'Escolher imagem'}
                            </button>
                            {customBgUrl && (
                                <div className="mt-2 rounded-lg overflow-hidden h-20 bg-black/40">
                                    <img src={customBgUrl} alt="Preview" className="w-full h-full object-cover" />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* WhatsApp */}
                <div
                    className="rounded-2xl p-6 border shadow-sm backdrop-blur-md"
                    style={{ background: colors.surface, borderColor: colors.border }}
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                                <Smartphone className="w-5 h-5 text-green-400" />
                            </div>
                            <div>
                                <h3 className="text-base font-black uppercase tracking-tighter" style={{ color: colors.textPrimary }}>WhatsApp</h3>
                                <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Notificações em tempo real</p>
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
                            <div className="rounded-xl p-4 border" style={{ background: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.2)' }}>
                                <p className="text-[9px] font-black text-green-400 uppercase tracking-wider mb-1">✨ Receba alertas no celular</p>
                                <p className="text-xs leading-relaxed" style={{ color: colors.textSecondary }}>
                                    Quando um cliente comprar na sua loja, você receberá os detalhes do pedido diretamente no WhatsApp.
                                </p>
                            </div>
                            <div>
                                <label className="block text-[9px] font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>Seu número com DDD</label>
                                <input
                                    type="tel"
                                    placeholder="(00) 00000-0000"
                                    value={whatsapp}
                                    onChange={(e) => setWhatsapp(e.target.value)}
                                    className="w-full px-5 py-4 rounded-xl placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                    style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                />
                                <p className="text-[8px] mt-2" style={{ color: colors.textSecondary }}>Exemplo: (11) 99999-9999</p>
                            </div>
                        </div>
                    )}
                    {!useWhatsapp && (
                        <div className="rounded-xl p-4 border text-center" style={{ background: colors.background, borderColor: colors.border }}>
                            <Bell className="w-6 h-6 mx-auto mb-2" style={{ color: colors.textSecondary }} />
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.textSecondary }}>Notificações apenas no app</p>
                            <p className="text-[9px] mt-1" style={{ color: colors.textSecondary }}>Você verá os pedidos na aba Painel</p>
                        </div>
                    )}
                </div>

                {/* Fonte */}
                <div
                    className="rounded-2xl p-6 border shadow-sm backdrop-blur-md"
                    style={{ background: colors.surface, borderColor: colors.border }}
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: colors.accentLight }}>
                            <Type className="w-5 h-5" style={{ color: colors.accent }} />
                        </div>
                        <div>
                            <h3 className="text-base font-black uppercase tracking-tighter" style={{ color: colors.textPrimary }}>Tamanho da Fonte</h3>
                            <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>Para melhor leitura</p>
                        </div>
                    </div>
                    <p className="text-xs mb-4" style={{ color: colors.textSecondary }}>Aumente ou diminua o tamanho dos textos em todo o aplicativo.</p>
                    <div className="grid grid-cols-3 gap-3">
                        <button
                            onClick={() => setFontSize('normal')}
                            className={`py-3 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all ${fontSize === 'normal' ? 'text-white shadow-md' : 'border hover:bg-white/10'
                                }`}
                            style={fontSize === 'normal' ? { background: colors.accent } : { background: colors.background, borderColor: colors.border, color: colors.textSecondary }}
                        >
                            Padrão
                        </button>
                        <button
                            onClick={() => setFontSize('large')}
                            className={`py-3 rounded-xl font-black uppercase text-[11px] tracking-wider transition-all ${fontSize === 'large' ? 'text-white shadow-md' : 'border hover:bg-white/10'
                                }`}
                            style={fontSize === 'large' ? { background: colors.accent } : { background: colors.background, borderColor: colors.border, color: colors.textSecondary }}
                        >
                            Grande
                        </button>
                        <button
                            onClick={() => setFontSize('extra-large')}
                            className={`py-3 rounded-xl font-black uppercase text-[12px] tracking-wider transition-all ${fontSize === 'extra-large' ? 'text-white shadow-md' : 'border hover:bg-white/10'
                                }`}
                            style={fontSize === 'extra-large' ? { background: colors.accent } : { background: colors.background, borderColor: colors.border, color: colors.textSecondary }}
                        >
                            Enorme
                        </button>
                    </div>
                    <div className="mt-4 p-3 rounded-xl border" style={{ background: colors.background, borderColor: colors.border }}>
                        <p
                            style={{ color: colors.textPrimary }}
                            className={`${fontSize === 'normal' ? 'text-sm' : fontSize === 'large' ? 'text-base' : 'text-lg'}`}
                        >
                            🔤 Exemplo de texto com esta fonte
                        </p>
                    </div>
                </div>

                {/* Salvar */}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="group relative w-full py-4 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: colors.accent, color: colors.accentText }}
                >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                        {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-5 h-5" /> Salvar Configurações</>}
                    </span>
                </button>

                {/* Sair */}
                <button
                    onClick={handleLogout}
                    className="group w-full py-4 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:shadow-lg active:scale-95 border-2"
                    style={{ background: 'transparent', borderColor: colors.accent, color: colors.accent }}
                >
                    <span className="flex items-center justify-center gap-2"><LogOut className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" /> Sair da Conta</span>
                </button>

                {/* Voltar */}
                <button
                    onClick={onBack}
                    className="group w-full py-4 rounded-xl font-black uppercase text-sm tracking-wider transition-all hover:shadow-lg active:scale-95 border-2"
                    style={{ background: 'transparent', borderColor: colors.border, color: colors.textSecondary }}
                >
                    <span className="flex items-center justify-center gap-2">
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                        Voltar
                    </span>
                </button>

                <div className="text-center pt-4">
                    <p className="text-[7px] mt-1" style={{ color: colors.textSecondary }}>Mostre ao mundo o que você tem de melhor</p>
                </div>
            </div>
        </div>
    )
}