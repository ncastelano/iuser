// src/components/ButtonSearch.tsx
'use client'

import { Search, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/app/theme'
import { useState, useRef, useEffect } from 'react'

interface ButtonSearchProps {
    placeholder?: string
    onSearch?: (query: string) => void
    onFocus?: () => void
    onBlur?: () => void
    initialValue?: string
    autoFocus?: boolean
    className?: string
    showClear?: boolean
    expandOnFocus?: boolean
    maxWidth?: number
    inputRef?: React.RefObject<HTMLInputElement>
    searchValue?: string
}

export default function ButtonSearch({
    placeholder = 'Buscar...',
    onSearch,
    onFocus,
    onBlur,
    initialValue = '',
    autoFocus = false,
    className = '',
    showClear = true,
    expandOnFocus = true,
    maxWidth = 400,
    inputRef: externalInputRef,
    searchValue: externalSearchValue,
}: ButtonSearchProps) {
    const router = useRouter()
    const { colors } = useTheme()
    const [isExpanded, setIsExpanded] = useState(false)
    const [internalSearchValue, setInternalSearchValue] = useState(initialValue)
    const internalInputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const searchValue = externalSearchValue !== undefined ? externalSearchValue : internalSearchValue
    const inputRef = externalInputRef || internalInputRef

    const GRADIENT = 'linear-gradient(135deg, #f97316, #dc2626)'

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                if (isExpanded) {
                    setIsExpanded(false)
                    if (onBlur) onBlur()
                }
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isExpanded, onBlur])

    useEffect(() => {
        if (isExpanded && inputRef.current) {
            inputRef.current.focus()
        }
    }, [isExpanded, inputRef])

    useEffect(() => {
        if (autoFocus) {
            setIsExpanded(true)
        }
    }, [autoFocus])

    const handleSearch = (value: string) => {
        if (externalSearchValue === undefined) {
            setInternalSearchValue(value)
        }
        if (onSearch) {
            onSearch(value)
        }
    }

    const handleClear = () => {
        handleSearch('')
        if (inputRef.current) {
            inputRef.current.focus()
        }
    }

    const handleClose = () => {
        setIsExpanded(false)
        handleSearch('')
        if (onBlur) onBlur()
        if (inputRef.current) {
            inputRef.current.blur()
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        // REMOVIDO: não faz mais navegação com Enter
        // Apenas mantém o Escape para fechar
        if (e.key === 'Escape') {
            handleClose()
        }
        // Enter agora apenas mantém o foco e não navega
        if (e.key === 'Enter') {
            e.preventDefault()
            // Mantém o foco no input
            if (inputRef.current) {
                inputRef.current.focus()
            }
        }
    }

    const handleFocus = () => {
        if (expandOnFocus) {
            setIsExpanded(true)
        }
        if (onFocus) onFocus()
    }

    const handleBlur = () => {
        if (!expandOnFocus) {
            if (onBlur) onBlur()
        }
    }

    const handleButtonClick = () => {
        setIsExpanded(true)
    }

    // Modificar o tipo de input para "search" para evitar o botão "Go" em alguns navegadores
    // e adicionar o atributo enterkeyhint="done" para sugerir "Concluído" no teclado virtual

    return (
        <div
            ref={containerRef}
            className={`transition-all duration-300 ease-in-out ${className}`}
            style={{
                position: 'relative',
                height: 56,
                width: isExpanded ? Math.min(maxWidth, window.innerWidth - 120) : 56,
                maxWidth: maxWidth,
                borderRadius: 999,
                background: GRADIENT,
                boxShadow: `0 8px 24px #f9731660`,
                display: 'flex',
                alignItems: 'center',
                padding: '0 4px',
                cursor: 'pointer',
                borderTop: '2px solid #f97316',
                borderRight: '2px solid #f97316',
                borderBottom: '2px solid #f97316',
                borderLeft: '2px solid #f97316',
            }}
        >
            {/* Ícone de busca - sempre visível */}
            <div
                style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: '#ffffff',
                    transition: 'all 0.3s ease',
                }}
                onClick={handleButtonClick}
            >
                <Search size={24} strokeWidth={2.5} />
            </div>

            {/* Input - aparece quando expandido */}
            <div
                style={{
                    flex: 1,
                    height: '100%',
                    overflow: 'hidden',
                    opacity: isExpanded ? 1 : 0,
                    transition: 'opacity 0.3s ease-in-out',
                    display: 'flex',
                    alignItems: 'center',
                    paddingRight: isExpanded ? 8 : 0,
                }}
            >
                <input
                    ref={inputRef}
                    type="search"
                    inputMode="search"
                    enterKeyHint="done"
                    placeholder={placeholder}
                    value={searchValue}
                    onChange={(e) => handleSearch(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    style={{
                        flex: 1,
                        height: '100%',
                        background: 'transparent',
                        borderTop: 'none',
                        borderRight: 'none',
                        borderBottom: 'none',
                        borderLeft: 'none',
                        outline: 'none',
                        padding: '0 12px',
                        fontSize: 15,
                        fontWeight: 500,
                        color: '#ffffff',
                        minWidth: 0,
                        letterSpacing: '0.3px',
                    }}
                />

                {/* Botão único: X para fechar OU limpar */}
                {isExpanded && (
                    <button
                        onClick={searchValue ? handleClear : handleClose}
                        style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.2)',
                            backdropFilter: 'blur(10px)',
                            borderTop: 'none',
                            borderRight: 'none',
                            borderBottom: 'none',
                            borderLeft: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'all 0.2s ease',
                            color: '#ffffff',
                            marginRight: 4,
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.3)'
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.2)'
                        }}
                        aria-label={searchValue ? "Limpar busca" : "Fechar"}
                        title={searchValue ? "Limpar busca" : "Fechar"}
                    >
                        <X size={18} strokeWidth={2.5} />
                    </button>
                )}
            </div>

            {/* Label flutuante quando fechado */}
            {!isExpanded && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: -6,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: 8,
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.8)',
                        background: 'rgba(0,0,0,0.3)',
                        backdropFilter: 'blur(10px)',
                        padding: '2px 8px',
                        borderRadius: 999,
                        borderTop: '1px solid rgba(255,255,255,0.1)',
                        borderRight: '1px solid rgba(255,255,255,0.1)',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        borderLeft: '1px solid rgba(255,255,255,0.1)',
                        opacity: 0.8,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        textShadow: '0 1px 4px rgba(0,0,0,0.2)',
                    }}
                >
                    Buscar
                </div>
            )}

            <style jsx>{`
                input::placeholder {
                    color: rgba(255,255,255,0.7) !important;
                    opacity: 1;
                    font-weight: 400;
                    letter-spacing: 0.3px;
                }
                input::-webkit-input-placeholder {
                    color: rgba(255,255,255,0.7) !important;
                    opacity: 1;
                }
                input::-moz-placeholder {
                    color: rgba(255,255,255,0.7) !important;
                    opacity: 1;
                }
                input:-ms-input-placeholder {
                    color: rgba(255,255,255,0.7) !important;
                    opacity: 1;
                }
                input:-moz-placeholder {
                    color: rgba(255,255,255,0.7) !important;
                    opacity: 1;
                }
                /* Remove o botão de busca padrão do Safari/WebKit */
                input[type="search"]::-webkit-search-decoration,
                input[type="search"]::-webkit-search-cancel-button,
                input[type="search"]::-webkit-search-results-button,
                input[type="search"]::-webkit-search-results-decoration {
                    display: none;
                    -webkit-appearance: none;
                }
                input[type="search"] {
                    -webkit-appearance: none;
                }
            `}</style>
        </div>
    )
}