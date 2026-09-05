// src/app/HeaderSearchInput.tsx
'use client'

import { Search, X } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { useEffect, useRef, useState } from 'react'

interface HeaderSearchInputProps {
    placeholder?: string
    value?: string
    onChange?: (query: string) => void
    inputRef?: React.RefObject<HTMLInputElement>
    onFocus?: () => void
    onBlur?: () => void
    className?: string
}

// ===== Mesmo campo de busca "padrão" usado no Header da home (pill com
// brilho, expande ao focar), para reaproveitar em outras páginas =====
export default function HeaderSearchInput({
    placeholder = 'Buscar...',
    value,
    onChange,
    inputRef: externalInputRef,
    onFocus,
    onBlur,
    className = '',
}: HeaderSearchInputProps) {
    const { colors } = useTheme()

    const [internalValue, setInternalValue] = useState('')
    const [isFocused, setIsFocused] = useState(false)
    const internalInputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const inputRef = externalInputRef || internalInputRef
    const currentValue = value !== undefined ? value : internalValue
    const isSearching = currentValue.length > 0
    const isExpanded = isFocused || isSearching

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                const target = event.target as HTMLElement
                const isLastSearched = target.closest?.('.last-searched-container')
                const isSearchResult = target.closest?.('.search-result-item')
                if (isLastSearched || isSearchResult) return

                if (!isSearching) {
                    setIsFocused(false)
                    if (onBlur) onBlur()
                }
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isSearching, onBlur])

    const handleSearch = (v: string) => {
        if (value === undefined) setInternalValue(v)
        if (onChange) onChange(v)
    }

    const handleClear = () => {
        handleSearch('')
        inputRef.current?.focus()
    }

    const handleClose = () => {
        handleSearch('')
        setIsFocused(false)
        if (onBlur) onBlur()
        inputRef.current?.blur()
    }

    const handleFocus = () => {
        setIsFocused(true)
        if (onFocus) onFocus()
    }

    const handleBlur = () => {
        if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current)
        blurTimeoutRef.current = setTimeout(() => {
            if (!isSearching) {
                setIsFocused(false)
                if (onBlur) onBlur()
            }
        }, 200)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') handleClose()
        if (e.key === 'Enter') {
            e.preventDefault()
            inputRef.current?.focus()
        }
    }

    return (
        <div
            className={`w-full ${className}`}
            style={{
                transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
        >
            <div
                ref={containerRef}
                className="relative w-full"
                style={{
                    height: 48,
                    borderRadius: 999,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 4px',
                    cursor: 'text',
                    background: 'transparent',
                    border: `1.5px solid ${isExpanded ? '#f97316' : colors.border}`,
                    transition: 'border-color 0.3s ease-in-out',
                    boxShadow: `0 0 0 1px #f97316, 0 0 5px #f9731640, 0 0 10px #fb923c30, 0 0 15px #f59e0b20`,
                    animation: 'headerSearchPulseGlow 2s ease-in-out infinite',
                }}
                onClick={() => inputRef.current?.focus()}
            >
                <div
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: colors.accent,
                        background: isExpanded ? `${colors.accent}15` : 'transparent',
                        transition: 'all 0.3s ease',
                    }}
                >
                    <Search size={18} strokeWidth={2} />
                </div>

                <div
                    style={{
                        flex: 1,
                        height: '100%',
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
                        value={currentValue}
                        onChange={(e) => handleSearch(e.target.value)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        style={{
                            flex: 1,
                            height: '100%',
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            padding: '0 12px',
                            fontSize: 14,
                            fontWeight: 500,
                            color: colors.textPrimary,
                            minWidth: 0,
                            letterSpacing: '0.3px',
                        }}
                    />
                </div>

                {isExpanded && (
                    <button
                        onClick={isSearching ? handleClear : handleClose}
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: isSearching ? `${colors.textSecondary}15` : 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'all 0.2s ease',
                            color: colors.accent,
                            marginRight: 4,
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = isSearching ? `${colors.textSecondary}25` : `${colors.textSecondary}10`
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = isSearching ? `${colors.textSecondary}15` : 'transparent'
                        }}
                        aria-label={isSearching ? 'Limpar busca' : 'Fechar busca'}
                        title={isSearching ? 'Limpar busca' : 'Fechar busca'}
                    >
                        <X size={16} strokeWidth={2} />
                    </button>
                )}
            </div>

            <style jsx>{`
                input::placeholder {
                    color: ${colors.textSecondary} !important;
                    opacity: 0.6;
                    font-weight: 400;
                    letter-spacing: 0.3px;
                }
                input::-webkit-input-placeholder {
                    color: ${colors.textSecondary} !important;
                    opacity: 0.6;
                }
                input::-moz-placeholder {
                    color: ${colors.textSecondary} !important;
                    opacity: 0.6;
                }
                input:-ms-input-placeholder {
                    color: ${colors.textSecondary} !important;
                    opacity: 0.6;
                }
                input:-moz-placeholder {
                    color: ${colors.textSecondary} !important;
                    opacity: 0.6;
                }
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
                @keyframes headerSearchPulseGlow {
                    0%, 100% {
                        box-shadow: 0 0 0 1px #f97316, 0 0 5px #f9731640, 0 0 10px #fb923c20;
                    }
                    50% {
                        box-shadow: 0 0 0 2px #fb923c, 0 0 10px #f9731660, 0 0 20px #fb923c40, 0 0 30px #f59e0b20;
                    }
                }
            `}</style>
        </div>
    )
}
