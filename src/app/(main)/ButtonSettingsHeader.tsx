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

type BgMode = 'black' | 'custom' | 'animated'

interface ConfiguracoesProps {
    onBack: () => void
    bgMode?: BgMode
    setBgMode?: (mode: BgMode) => void
    customBgUrl?: string | null
    setCustomBgUrl?: (url: string | null) => void
    isWhiteBg?: boolean
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
        { mode: 'black' as const, label: 'Sem animação', icon: Palette, desc: 'Fundo sólido' },
        { mode: 'custom' as const, label: 'Sua foto', icon: Camera, desc: 'Sua própria imagem' },
    ]

    // ===== STYLE PARA BOTÕES PILL =====
    const pillButtonStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        width: '100%',
        padding: '0.75rem 1.25rem',
        borderRadius: '9999px',
        fontSize: '0.875rem',
        fontWeight: 700,
        transition: 'all 0.2s ease',
        cursor: 'pointer',
        border: 'none',
    }

    return (
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 pb-24">
            <div className="space-y-6">
                {/* Card Tema do iUser */}
                <div
                    className="rounded-2xl p-6 border shadow-sm backdrop-blur-md"
                    style={{ background: colors.surface, borderColor: colors.border }}
                >
                    <ColloriUser />
                </div>

                {/* Plano de Fundo */}
                <div
                    className="rounded-2xl p-6 border shadow-sm backdrop-blur-md"
                    style={{ background: colors.surface, borderColor: colors.border }}
                >
                    <div className="flex items-center gap-3 mb-4">
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                boxShadow: `0 4px 12px #f9731640`,
                            }}
                        >
                            <Image className="w-5 h-5" />
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
                                        background: isSelected ? '#f9731620' : colors.background,
                                        borderColor: isSelected ? '#f97316' : colors.border,
                                    }}
                                >
                                    {isSelected && (
                                        <div
                                            className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center"
                                            style={{ background: GRADIENT }}
                                        >
                                            <Check size={12} color="#ffffff" />
                                        </div>
                                    )}
                                    <opt.icon size={20} color={isSelected ? '#f97316' : colors.textSecondary} />
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
                                style={{
                                    ...pillButtonStyle,
                                    background: colors.background,
                                    borderColor: colors.border,
                                    color: colors.textSecondary,
                                }}
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
                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#22c55e20' }}>
                                <Smartphone className="w-5 h-5" style={{ color: '#22c55e' }} />
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
                                    className="w-full px-5 py-4 rounded-full placeholder:text-gray-400 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/20"
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
                        <div
                            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{
                                background: GRADIENT,
                                color: '#ffffff',
                                boxShadow: `0 4px 12px #f9731640`,
                            }}
                        >
                            <Type className="w-5 h-5" />
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
                            className={`py-3 rounded-full font-black uppercase text-[10px] tracking-wider transition-all ${fontSize === 'normal' ? 'text-white shadow-md' : 'border hover:bg-white/10'}`}
                            style={fontSize === 'normal' ? { background: GRADIENT } : { background: colors.background, borderColor: colors.border, color: colors.textSecondary }}
                        >
                            Padrão
                        </button>
                        <button
                            onClick={() => setFontSize('large')}
                            className={`py-3 rounded-full font-black uppercase text-[11px] tracking-wider transition-all ${fontSize === 'large' ? 'text-white shadow-md' : 'border hover:bg-white/10'}`}
                            style={fontSize === 'large' ? { background: GRADIENT } : { background: colors.background, borderColor: colors.border, color: colors.textSecondary }}
                        >
                            Grande
                        </button>
                        <button
                            onClick={() => setFontSize('extra-large')}
                            className={`py-3 rounded-full font-black uppercase text-[12px] tracking-wider transition-all ${fontSize === 'extra-large' ? 'text-white shadow-md' : 'border hover:bg-white/10'}`}
                            style={fontSize === 'extra-large' ? { background: GRADIENT } : { background: colors.background, borderColor: colors.border, color: colors.textSecondary }}
                        >
                            Enorme
                        </button>
                    </div>
                    <div className="mt-4 p-3 rounded-2xl border" style={{ background: colors.background, borderColor: colors.border }}>
                        <p
                            style={{ color: colors.textPrimary }}
                            className={`${fontSize === 'normal' ? 'text-sm' : fontSize === 'large' ? 'text-base' : 'text-lg'}`}
                        >
                            🔤 Exemplo de texto com esta fonte
                        </p>
                    </div>
                </div>

                {/* Salvar - PILL */}
                <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                        ...pillButtonStyle,
                        background: GRADIENT,
                        color: '#ffffff',
                        boxShadow: `0 4px 14px #f9731660`,
                        opacity: saving ? 0.5 : 1,
                        cursor: saving ? 'not-allowed' : 'pointer',
                    }}
                    className="hover:scale-105 transition-transform active:scale-95"
                >
                    <span className="flex items-center justify-center gap-2">
                        {saving ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-5 h-5" /> Salvar Configurações</>}
                    </span>
                </button>

                {/* Sair - PILL */}
                <button
                    onClick={handleLogout}
                    style={{
                        ...pillButtonStyle,
                        background: 'transparent',
                        border: `2px solid #f97316`,
                        color: '#f97316',
                    }}
                    className="hover:scale-105 transition-transform active:scale-95 hover:bg-orange-50/10"
                >
                    <span className="flex items-center justify-center gap-2"><LogOut className="w-5 h-5" /> Sair da Conta</span>
                </button>

                {/* Voltar - PILL */}
                <button
                    onClick={onBack}
                    style={{
                        ...pillButtonStyle,
                        background: 'transparent',
                        border: `1px solid ${colors.border}`,
                        color: colors.textSecondary,
                    }}
                    className="hover:opacity-70 transition-opacity"
                >
                    <span className="flex items-center justify-center gap-2">
                        <ArrowLeft className="w-5 h-5" />
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