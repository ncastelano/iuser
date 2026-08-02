'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import {
    ArrowLeft, Save, LogOut, Type, Bell, Smartphone, Sparkles,
    Image, Camera, Check, Palette
} from 'lucide-react'
import { useFontStore } from '@/store/useFontStore'
import { toast } from 'sonner'
import ColloriUser from '@/components/ColloriUser'
import { useTheme } from '@/app/theme'
import { LoadingSpinner } from '@/components/LoadingSpinner'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

type BgMode = 'black' | 'custom'

interface ConfiguracoesProps {
    onBack: () => void
    bgMode?: BgMode
    setBgMode?: (mode: BgMode) => void
    customBgUrl?: string | null
    setCustomBgUrl?: (url: string | null) => void
    isWhiteBg?: boolean
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return {
        r: (bigint >> 16) & 255,
        g: (bigint >> 8) & 255,
        b: bigint & 255,
    }
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

    const { colors, current, setTheme } = useTheme()
    const { fontSize, setFontSize } = useFontStore()
    const surfaceRgb = hexToRgb(colors.surface)

    const [bgMode, _setBgMode] = useState<BgMode>(propBgMode)
    const [customBgUrl, _setCustomBgUrl] = useState<string | null>(propCustomBgUrl)
    const [whatsapp, setWhatsapp] = useState('')
    const [useWhatsapp, setUseWhatsapp] = useState(true)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [uploadingBg, setUploadingBg] = useState(false)
    const [authChecked, setAuthChecked] = useState(false)

    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
                router.push('/login')
                return
            }
            setAuthChecked(true)
        }
        checkSession()
    }, [router])

    useEffect(() => {
        _setBgMode(propBgMode)
    }, [propBgMode])

    useEffect(() => {
        _setCustomBgUrl(propCustomBgUrl)
    }, [propCustomBgUrl])

    useEffect(() => {
        if (!authChecked) return

        async function loadProfile() {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data } = await supabase
                    .from('profiles')
                    .select('whatsapp, app_theme, font_size')
                    .eq('id', user.id)
                    .single()

                if (data) {
                    if (data.whatsapp) {
                        setWhatsapp(data.whatsapp)
                        setUseWhatsapp(true)
                    } else {
                        setUseWhatsapp(false)
                    }

                    if (data.app_theme) {
                        setTheme(data.app_theme)
                    }

                    if (data.font_size) {
                        setFontSize(data.font_size)
                    }
                }
            }
            setLoading(false)
        }
        loadProfile()
    }, [authChecked, setTheme, setFontSize])

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
                    app_theme: current,
                    font_size: fontSize,
                })
                .eq('id', user.id)

            if (error) {
                toast.error(`Erro ao salvar: ${error.message}`)
            } else {
                toast.success('Configurações salvas com sucesso!')
                setBgMode(bgMode)
                setCustomBgUrl(customBgUrl)
            }
        } else {
            router.push('/login')
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

    if (!authChecked || loading) {
        return <LoadingSpinner message="Carregando configurações..." />
    }

    const bgOptions = [
        { mode: 'black' as const, label: 'Sem Imagem', icon: Palette, desc: 'Fundo sólido' },
        { mode: 'custom' as const, label: 'Sua Imagem', icon: Camera, desc: 'Sua própria imagem' },
    ]

    // ===== STYLE PARA BOTÕES PILL =====
    const pillButtonStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1.25rem',
        borderRadius: '9999px',
        fontSize: '0.875rem',
        fontWeight: 700,
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        border: 'none',
        textDecoration: 'none',
    }

    const pillButtonFullStyle: React.CSSProperties = {
        ...pillButtonStyle,
        width: '100%',
    }

    return (
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 pb-24">
            <div className="space-y-6">
                {/* Card Tema do iUser - mesmo estilo do ButtonSettingsHome */}
                <div
                    className="rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        border: `1px solid ${colors.border}`,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        boxShadow: colors.shadow,
                    }}
                >
                    <div className="flex items-center gap-4">
                        <div
                            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                boxShadow: `0 4px 12px #f9731640`,
                            }}
                        >
                            <Image className="w-7 h-7" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Tema do iUser
                            </h3>
                            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                                Escolha o tema que combina com você
                            </p>
                        </div>
                    </div>
                    <div className="flex-shrink-0">
                        <ColloriUser />
                    </div>
                </div>

                {/* Plano de Fundo */}
                <div
                    className="rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        border: `1px solid ${colors.border}`,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        boxShadow: colors.shadow,
                    }}
                >
                    <div className="flex items-center gap-4">
                        <div
                            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                boxShadow: `0 4px 12px #f9731640`,
                            }}
                        >
                            <Palette className="w-7 h-7" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Plano de Fundo
                            </h3>
                            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                                Escolha o visual do app
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                        {bgOptions.map(opt => {
                            const isSelected = bgMode === opt.mode
                            return (
                                <button
                                    key={opt.mode}
                                    onClick={() => handleBgModeChange(opt.mode)}
                                    className={`relative flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all hover:scale-105 active:scale-95 ${isSelected ? 'text-white shadow-md' : ''}`}
                                    style={{
                                        background: isSelected ? GRADIENT : 'transparent',
                                        border: `1px solid ${isSelected ? 'transparent' : colors.border}`,
                                        color: isSelected ? '#ffffff' : colors.textSecondary,
                                        boxShadow: isSelected ? `0 4px 12px #f9731640` : 'none',
                                    }}
                                >
                                    {isSelected && (
                                        <div
                                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                                            style={{ background: '#10b981' }}
                                        >
                                            <Check size={8} color="#ffffff" />
                                        </div>
                                    )}
                                    <opt.icon size={14} />
                                    <span>{opt.label}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Custom Background Upload */}
                {bgMode === 'custom' && (
                    <div
                        className="rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4"
                        style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                            border: `1px solid ${colors.border}`,
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            boxShadow: colors.shadow,
                        }}
                    >
                        <div className="flex items-center gap-4 flex-1">
                            <div
                                className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden"
                                style={{
                                    background: GRADIENT,
                                    color: '#ffffff',
                                    boxShadow: `0 4px 12px #f9731640`,
                                }}
                            >
                                {customBgUrl ? (
                                    <img src={customBgUrl} className="w-full h-full object-cover" alt="Background" />
                                ) : (
                                    <Image className="w-7 h-7" />
                                )}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                    {customBgUrl ? 'Imagem personalizada' : 'Nenhuma imagem selecionada'}
                                </h3>
                                <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                                    {customBgUrl ? 'Clique em "Trocar" para alterar a imagem' : 'Escolha uma imagem para o fundo do app'}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                            <input type="file" ref={fileInputRef} onChange={handleBgUpload} accept="image/*" style={{ display: 'none' }} id="bg-upload-input" />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploadingBg}
                                className="px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-lg disabled:opacity-50"
                                style={{
                                    background: GRADIENT,
                                    color: '#ffffff',
                                    boxShadow: `0 4px 14px #f9731660`,
                                }}
                            >
                                {uploadingBg ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <Camera size={16} />
                                )}
                                {customBgUrl ? 'Trocar' : 'Escolher'}
                            </button>
                            {customBgUrl && (
                                <button
                                    onClick={() => {
                                        _setCustomBgUrl(null)
                                        setCustomBgUrl(null)
                                    }}
                                    className="px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                                    style={{
                                        background: '#ef4444',
                                        color: '#ffffff',
                                        boxShadow: `0 4px 14px #ef444460`,
                                    }}
                                >
                                    <span>Remover</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* WhatsApp */}
                <div
                    className="rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        border: `1px solid ${colors.border}`,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        boxShadow: colors.shadow,
                    }}
                >
                    <div className="flex items-center gap-4 flex-1">
                        <div
                            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: '#22c55e20',
                                border: `2px solid #22c55e30`,
                            }}
                        >
                            <Smartphone className="w-7 h-7" style={{ color: '#22c55e' }} />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-3">
                                <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                    WhatsApp
                                </h3>
                                <span className={`text-[10px] font-black px-3 py-1 rounded-full ${useWhatsapp ? 'bg-green-500/20 text-green-600' : 'bg-gray-500/20 text-gray-600'}`}>
                                    {useWhatsapp ? 'Ativo' : 'Inativo'}
                                </span>
                            </div>
                            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                                Receba notificações em tempo real
                            </p>
                        </div>
                    </div>
                    <div className="flex-shrink-0">
                        <button
                            onClick={() => setUseWhatsapp(!useWhatsapp)}
                            className={`relative w-12 h-6 rounded-full transition-all ${useWhatsapp ? 'bg-green-500' : 'bg-gray-600'}`}
                        >
                            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all ${useWhatsapp ? 'right-0.5' : 'left-0.5'}`} />
                        </button>
                    </div>
                </div>

                {/* WhatsApp Input - aparece apenas se useWhatsapp for true */}
                {useWhatsapp && (
                    <div
                        className="rounded-2xl p-6"
                        style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.4)`,
                            border: `1px solid ${colors.border}`,
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                        }}
                    >
                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>
                                    Seu número com DDD
                                </label>
                                <input
                                    type="tel"
                                    placeholder="(00) 00000-0000"
                                    value={whatsapp}
                                    onChange={(e) => setWhatsapp(e.target.value)}
                                    className="w-full px-5 py-4 rounded-full placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                                    style={{ background: colors.background, border: `1px solid ${colors.border}`, color: colors.textPrimary }}
                                />
                                <p className="text-[10px] mt-2" style={{ color: colors.textSecondary }}>
                                    Exemplo: (11) 99999-9999
                                </p>
                            </div>
                            <div className="rounded-xl p-4 border" style={{ background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)' }}>
                                <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider flex items-center gap-2">
                                    <Bell className="w-4 h-4" />
                                    ✨ Receba alertas no celular
                                </p>
                                <p className="text-xs mt-1 leading-relaxed" style={{ color: colors.textSecondary }}>
                                    Quando um cliente comprar na sua loja, você receberá os detalhes do pedido diretamente no WhatsApp.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {!useWhatsapp && (
                    <div
                        className="rounded-2xl p-6"
                        style={{
                            background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                            border: `1px dashed ${colors.border}`,
                        }}
                    >
                        <div className="flex items-center gap-4">
                            <Bell className="w-10 h-10" style={{ color: colors.textSecondary }} />
                            <div>
                                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                                    Notificações apenas no app
                                </p>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                    Você verá os pedidos na aba Painel
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Fonte */}
                <div
                    className="rounded-2xl p-6 flex flex-col gap-4"
                    style={{
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                        border: `1px solid ${colors.border}`,
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        boxShadow: colors.shadow,
                    }}
                >
                    <div className="flex items-center gap-4">
                        <div
                            className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                boxShadow: `0 4px 12px #f9731640`,
                            }}
                        >
                            <Type className="w-7 h-7" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                                Tamanho da Fonte
                            </h3>
                            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                                Para melhor leitura
                            </p>
                        </div>
                    </div>

                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                        Aumente ou diminua o tamanho dos textos em todo o aplicativo.
                    </p>

                    <div className="flex gap-3">
                        <button
                            onClick={() => setFontSize('normal')}
                            className={`flex-1 py-3 rounded-full font-black uppercase text-[10px] tracking-wider transition-all hover:scale-105 active:scale-95 ${fontSize === 'normal' ? 'text-white shadow-md' : ''}`}
                            style={fontSize === 'normal' ? { background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 12px #f9731640` } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                        >
                            Padrão
                        </button>
                        <button
                            onClick={() => setFontSize('large')}
                            className={`flex-1 py-3 rounded-full font-black uppercase text-[11px] tracking-wider transition-all hover:scale-105 active:scale-95 ${fontSize === 'large' ? 'text-white shadow-md' : ''}`}
                            style={fontSize === 'large' ? { background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 12px #f9731640` } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                        >
                            Grande
                        </button>
                        <button
                            onClick={() => setFontSize('extra-large')}
                            className={`flex-1 py-3 rounded-full font-black uppercase text-[12px] tracking-wider transition-all hover:scale-105 active:scale-95 ${fontSize === 'extra-large' ? 'text-white shadow-md' : ''}`}
                            style={fontSize === 'extra-large' ? { background: GRADIENT, color: '#ffffff', boxShadow: `0 4px 12px #f9731640` } : { background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textSecondary }}
                        >
                            Enorme
                        </button>
                    </div>

                    <div className="mt-2 p-4 rounded-2xl border" style={{ background: colors.background, borderColor: colors.border }}>
                        <p
                            style={{ color: colors.textPrimary }}
                            className={`${fontSize === 'normal' ? 'text-sm' : fontSize === 'large' ? 'text-base' : 'text-lg'}`}
                        >
                            🔤 Exemplo de texto com esta fonte
                        </p>
                    </div>
                </div>

                {/* Botões de ação */}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        ...pillButtonFullStyle,
                        background: GRADIENT,
                        color: '#ffffff',
                        boxShadow: `0 4px 14px #f9731660`,
                        opacity: saving ? 0.6 : 1,
                    }}
                    className="hover:scale-105 transition-transform active:scale-95"
                >
                    {saving ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            <Save className="w-5 h-5" />
                            Salvar Configurações
                        </>
                    )}
                </button>

                <button
                    onClick={handleLogout}
                    style={{
                        ...pillButtonFullStyle,
                        background: GRADIENT,
                        color: '#ffffff',
                        boxShadow: `0 4px 14px #f9731660`,
                    }}
                    className="hover:scale-105 transition-transform active:scale-95"
                >
                    <LogOut className="w-5 h-5" />
                    Sair da Conta
                </button>

                <button
                    onClick={onBack}
                    style={{
                        ...pillButtonFullStyle,
                        background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.3)`,
                        border: `1px solid ${colors.border}`,
                        color: colors.textSecondary,
                    }}
                    className="hover:opacity-70 transition-opacity"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Voltar
                </button>

                <div className="text-center pt-2">
                    <p className="text-[7px]" style={{ color: colors.textSecondary }}>
                        Mostre ao mundo o que você tem de melhor
                    </p>
                </div>
            </div>
        </div>
    )
}