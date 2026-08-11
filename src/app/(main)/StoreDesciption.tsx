// src/components/StoreDescription.tsx
'use client'

import { useRef, useState, useEffect } from 'react'
import { Camera, Store, Link, ChevronDown, ChevronUp, ImageIcon, AlertCircle, Tag, CheckCircle2 } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { toast } from 'sonner'
import { categorias } from '@/lib/categorias'

// ===== GRADIENTE FIXO LARANJA-VERMELHO =====
const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

// ===== STYLE PARA BOTÕES PILL =====
const pillButtonStyle = {
    padding: '0.75rem 1.25rem',
    borderRadius: '9999px',
    fontWeight: 700,
    fontSize: '0.875rem',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    border: 'none',
}

function hexToRgb(hex: string) {
    const clean = hex.replace('#', '')
    const bigint = parseInt(clean, 16)
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

// Filtra as categorias para remover "Social" (lojas não podem ser sociais)
const CATEGORIAS_LOJAS = categorias.filter(cat => cat.slug !== 'social')

interface StoreDescriptionProps {
    name: string
    storeSlug: string
    description: string
    preview: string | null
    category?: string | null
    onNameChange: (value: string) => void
    onSlugChange: (value: string) => void
    onDescriptionChange: (value: string) => void
    onImageChange: (file: File) => void
    onCategoryChange?: (category: string) => void
    slugStatus: 'idle' | 'checking' | 'available' | 'taken'
    disabled?: boolean
    isExpanded?: boolean
    onToggleExpand?: () => void
    onSave?: () => void
    onCancel?: () => void
    saving?: boolean
}

export function StoreDescription({
    name,
    storeSlug,
    description,
    preview,
    category = '',
    onNameChange,
    onSlugChange,
    onDescriptionChange,
    onImageChange,
    onCategoryChange,
    slugStatus,
    disabled = false,
    isExpanded: externalExpanded,
    onToggleExpand,
    onSave,
    onCancel,
    saving = false,
}: StoreDescriptionProps) {
    const { colors } = useTheme()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const surfaceRgb = hexToRgb(colors.surface)

    // Estado interno para controle de expansão (caso não seja controlado externamente)
    const [internalExpanded, setInternalExpanded] = useState(false)
    const [selectedCategorySlug, setSelectedCategorySlug] = useState('')

    // Inicializa a categoria selecionada
    useEffect(() => {
        if (category) {
            // Tenta encontrar a categoria pelo nome
            const found = CATEGORIAS_LOJAS.find(c => c.nome === category)
            if (found) {
                setSelectedCategorySlug(found.slug)
            }
        }
    }, [category])

    // Usa o estado externo se fornecido, senão usa o interno
    const isExpanded = externalExpanded !== undefined ? externalExpanded : internalExpanded

    const handleToggle = () => {
        if (onToggleExpand) {
            onToggleExpand()
        } else {
            setInternalExpanded(!internalExpanded)
        }
    }

    const handleImageClick = () => {
        if (!disabled) {
            fileInputRef.current?.click()
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0]
            // Validação básica de tamanho (5MB)
            if (file.size > 5 * 1024 * 1024) {
                toast.error('A imagem deve ter no máximo 5MB')
                return
            }
            onImageChange(file)
        }
    }

    const handleCategorySelect = (slug: string) => {
        setSelectedCategorySlug(slug)
        if (onCategoryChange) {
            const cat = CATEGORIAS_LOJAS.find(c => c.slug === slug)
            onCategoryChange(cat?.nome || slug)
        }
    }

    const getSlugStatusText = () => {
        switch (slugStatus) {
            case 'checking':
                return { text: 'Verificando...', color: colors.textSecondary, icon: null }
            case 'available':
                return { text: 'Disponível', color: '#22c55e', icon: '✅' }
            case 'taken':
                return { text: 'Já está em uso', color: '#ef4444', icon: '❌' }
            default:
                return null
        }
    }

    const status = getSlugStatusText()
    const selectedCategory = CATEGORIAS_LOJAS.find(c => c.slug === selectedCategorySlug)

    return (
        <div
            className="rounded-2xl p-6 flex flex-col gap-5 relative"
            style={{
                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.6)`,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: `1px solid ${colors.border}`,
                boxShadow: colors.shadow,
            }}
        >
            {/* Cabeçalho com toggle - PILL */}
            <button
                onClick={handleToggle}
                className="w-full flex items-center justify-between text-left"
                style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '9999px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                }}
            >
                <div className="flex items-center gap-3">
                    <div
                        className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                            background: GRADIENT,
                            color: '#ffffff',
                        }}
                    >
                        <ImageIcon size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-black" style={{ color: colors.textPrimary }}>
                            Informações da Loja
                        </h3>
                        {/* ===== INFORMAÇÕES EM COLUNA COM MINIATURA DA LOGO ===== */}
                        <div className="flex items-start gap-2 text-xs mt-1" style={{ color: colors.textSecondary }}>
                            {/* Mini logo */}
                            {preview ? (
                                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border border-orange-200">
                                    <img src={preview} className="w-full h-full object-cover" alt="Logo" />
                                </div>
                            ) : (
                                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-orange-100">
                                    <Store size={14} className="text-orange-400" />
                                </div>
                            )}
                            <div className="flex flex-col gap-0.5">
                                <span className="font-bold text-sm" style={{ color: colors.textPrimary }}>
                                    {name ? name : 'Sem nome'}
                                </span>
                                <span className="text-[10px]">
                                    @{storeSlug || 'sem-slug'}
                                </span>
                                {selectedCategory && (
                                    <span className="text-[10px] flex items-center gap-1" style={{ color: colors.textSecondary }}>
                                        <Tag size={10} style={{ color: selectedCategory.color }} />
                                        {selectedCategory.nome}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {isExpanded ? (
                        <ChevronUp size={22} style={{ color: colors.textSecondary }} />
                    ) : (
                        <ChevronDown size={22} style={{ color: colors.textSecondary }} />
                    )}
                </div>
            </button>

            {isExpanded && (
                <>
                    <div className="space-y-4">
                        {/* Logo */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                Logo da Loja
                            </label>
                            <div
                                onClick={handleImageClick}
                                className={`relative w-32 h-32 mx-auto rounded-full overflow-hidden bg-gradient-to-br from-orange-100 to-red-100 border-2 border-orange-200 group cursor-pointer hover:border-orange-500 transition-all duration-500 shadow-lg ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {preview ? (
                                    <img src={preview} className="w-full h-full object-cover" alt="Logo" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-orange-300 text-3xl font-black">
                                        {name?.charAt(0) || '!'}
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
                                    <Camera className="w-8 h-8 text-white" />
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleFileChange}
                                    disabled={disabled}
                                />
                            </div>
                            <p className="text-[8px] text-center font-medium" style={{ color: colors.textSecondary }}>
                                Clique para alterar a logo (max. 5MB)
                            </p>
                        </div>

                        {/* Nome */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                Nome da Loja *
                            </label>
                            <div
                                className="flex items-center gap-2 px-4 py-3 rounded-xl transition-all focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                    border: `2px solid ${colors.border}`,
                                }}
                            >
                                <Store size={16} className="text-orange-400 flex-shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Minha Loja iUser"
                                    value={name}
                                    onChange={(e) => onNameChange(e.target.value)}
                                    className="flex-1 bg-transparent text-sm outline-none"
                                    style={{ color: colors.textPrimary }}
                                    disabled={disabled}
                                />
                            </div>
                        </div>

                        {/* Slug */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                URL da Loja *
                            </label>
                            <div
                                className="flex rounded-xl overflow-hidden transition-all focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                    border: `2px solid ${colors.border}`,
                                }}
                            >
                                <span
                                    className="flex items-center px-3 text-[10px] font-bold flex-shrink-0"
                                    style={{
                                        background: `${colors.border}30`,
                                        color: colors.textSecondary,
                                    }}
                                >
                                    <Link size={12} className="mr-1.5" />
                                    iuser.com.br/
                                </span>
                                <input
                                    type="text"
                                    placeholder="minha-loja"
                                    value={storeSlug}
                                    onChange={(e) => onSlugChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                    className="w-full px-4 py-3 bg-transparent text-sm outline-none"
                                    style={{ color: colors.textPrimary }}
                                    disabled={disabled}
                                />
                            </div>
                            {status && (
                                <div className="flex items-center gap-1.5 text-[9px] font-bold animate-pulse" style={{ color: status.color }}>
                                    {status.icon && <span>{status.icon}</span>}
                                    {status.text}
                                </div>
                            )}
                            {slugStatus === 'taken' && (
                                <div className="flex items-center gap-1.5 text-[9px] font-bold" style={{ color: '#ef4444' }}>
                                    <AlertCircle size={12} />
                                    Escolha outro nome de URL
                                </div>
                            )}
                        </div>

                        {/* ===== CATEGORIA ===== */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                <Tag size={12} className="inline mr-1.5" />
                                Categoria *
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {CATEGORIAS_LOJAS.map((cat) => {
                                    const Icon = cat.icone
                                    const isSelected = selectedCategorySlug === cat.slug
                                    return (
                                        <button
                                            key={cat.slug}
                                            type="button"
                                            onClick={() => handleCategorySelect(cat.slug)}
                                            disabled={disabled}
                                            className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${isSelected
                                                    ? 'border-orange-500 bg-orange-50/40 shadow-md'
                                                    : 'border-orange-200/50 bg-white/20 hover:bg-orange-50/30'
                                                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                        >
                                            <Icon
                                                className="w-5 h-5"
                                                style={{ color: isSelected ? '#f97316' : cat.color }}
                                            />
                                            <span className={`text-[9px] font-bold ${isSelected ? 'text-orange-600' : 'text-gray-600'}`}>
                                                {cat.nome}
                                            </span>
                                            {isSelected && (
                                                <CheckCircle2 className="w-3 h-3 text-orange-500" />
                                            )}
                                        </button>
                                    )
                                })}
                            </div>
                            {selectedCategory && (
                                <div className="flex items-center gap-2 text-[9px] font-bold text-green-600 mt-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Categoria: {selectedCategory.nome}
                                </div>
                            )}
                            {!selectedCategory && (
                                <div className="flex items-center gap-2 text-[9px] font-bold text-orange-500 mt-1">
                                    <AlertCircle size={12} />
                                    Selecione uma categoria
                                </div>
                            )}
                        </div>

                        {/* Descrição */}
                        <div className="space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                Descrição
                            </label>
                            <textarea
                                placeholder="Conte a história da sua marca..."
                                value={description}
                                onChange={(e) => onDescriptionChange(e.target.value)}
                                rows={4}
                                className="w-full px-4 py-3 rounded-xl text-sm resize-none transition-all focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                                style={{
                                    background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                    border: `2px solid ${colors.border}`,
                                    color: colors.textPrimary,
                                }}
                                disabled={disabled}
                            />
                            <p className="text-[8px] font-medium" style={{ color: colors.textSecondary }}>
                                {description.length}/500 caracteres
                            </p>
                        </div>
                    </div>

                    {/* Botões de ação - PILL */}
                    <div className="flex gap-3 mt-2">
                        <button
                            onClick={onCancel}
                            style={{
                                ...pillButtonStyle,
                                flex: 1,
                                background: `rgba(${surfaceRgb.r}, ${surfaceRgb.g}, ${surfaceRgb.b}, 0.2)`,
                                border: `2px solid ${colors.border}`,
                                color: colors.textSecondary,
                            }}
                            className="hover:opacity-70 transition-opacity"
                            disabled={disabled}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={onSave}
                            disabled={saving || disabled || slugStatus === 'taken' || !name.trim() || !storeSlug.trim() || !selectedCategorySlug}
                            style={{
                                ...pillButtonStyle,
                                flex: 1,
                                background: (saving || disabled || slugStatus === 'taken' || !name.trim() || !storeSlug.trim() || !selectedCategorySlug) ? colors.border : GRADIENT,
                                color: (saving || disabled || slugStatus === 'taken' || !name.trim() || !storeSlug.trim() || !selectedCategorySlug) ? colors.textSecondary : '#ffffff',
                                opacity: (saving || disabled || slugStatus === 'taken' || !name.trim() || !storeSlug.trim() || !selectedCategorySlug) ? 0.5 : 1,
                                cursor: (saving || disabled || slugStatus === 'taken' || !name.trim() || !storeSlug.trim() || !selectedCategorySlug) ? 'not-allowed' : 'pointer',
                            }}
                            className="hover:opacity-80 transition-opacity"
                        >
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}