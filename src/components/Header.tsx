// src/components/Header.tsx
'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, X } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useState, useRef, useEffect } from 'react'
import PageTabs, { type Tab } from '@/components/PageTabs'

export type { Tab }

interface HeaderProps {
    title?: string
    showBack?: boolean
    onBack?: () => void
    tabs?: Tab[]
    showSearch?: boolean
    searchPlaceholder?: string
    onSearch?: (query: string) => void
    searchValue?: string
    searchRef?: React.RefObject<HTMLInputElement>
    onSearchFocus?: () => void
    onSearchBlur?: (e: React.FocusEvent<HTMLInputElement>) => void
    locationElement?: React.ReactNode
    /** v3: título, abas e busca ficam presos no topo enquanto a lista rola */
    pinned?: boolean
}

export default function Header({
    title,
    showBack = false,
    onBack,
    tabs,
    showSearch = false,
    searchPlaceholder = 'Procurar...',
    onSearch,
    searchValue = '',
    searchRef: externalSearchRef,
    onSearchFocus,
    onSearchBlur,
    locationElement,
    pinned = false,
}: HeaderProps) {
    const router = useRouter()
    const { colors } = useTheme()

    const [internalSearchValue, setInternalSearchValue] = useState('')
    const [isFocused, setIsFocused] = useState(false)
    const internalInputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    const inputRef = externalSearchRef || internalInputRef
    const currentSearchValue = searchValue !== undefined ? searchValue : internalSearchValue
    const isSearching = currentSearchValue.length > 0

    // Verifica se deve estar expandido (focado OU com texto)
    const isExpanded = isFocused || isSearching

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                const target = event.target as HTMLElement
                const isLastSearched = target.closest?.('.last-searched-container')
                const isSearchResult = target.closest?.('.search-result-item')

                if (isLastSearched || isSearchResult) {
                    return
                }

                // Se não tiver texto, pode fechar
                if (!isSearching) {
                    setIsFocused(false)
                    if (onSearchBlur) {
                        onSearchBlur({} as React.FocusEvent<HTMLInputElement>)
                    }
                }
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isSearching, onSearchBlur])

    const handleSearch = (value: string) => {
        if (searchValue === undefined) {
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
        handleSearch('')
        setIsFocused(false)
        if (onSearchBlur) {
            onSearchBlur({} as React.FocusEvent<HTMLInputElement>)
        }
        if (inputRef.current) {
            inputRef.current.blur()
        }
    }

    const handleFocus = () => {
        setIsFocused(true)
        if (onSearchFocus) onSearchFocus()
    }

    const handleBlur = () => {
        if (blurTimeoutRef.current) {
            clearTimeout(blurTimeoutRef.current)
        }

        blurTimeoutRef.current = setTimeout(() => {
            // Só fecha se não tiver texto
            if (!isSearching) {
                setIsFocused(false)
                if (onSearchBlur) {
                    onSearchBlur({} as React.FocusEvent<HTMLInputElement>)
                }
            }
        }, 200)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            handleClose()
        }
        if (e.key === 'Enter') {
            e.preventDefault()
            if (inputRef.current) {
                inputRef.current.focus()
            }
        }
    }

    const handleBack = () => {
        if (onBack) onBack()
        else router.back()
    }

    const enhancedTabs: Tab[] = tabs || []

    // Rola a aba ativa pra dentro da área visível - importante numa lista
    // que precisa de swipe pro lado (celular): sem isso, uma aba que virou
    // ativa fora da tela (ex: Admin, sempre presente mas nem sempre visível)
    // parece que "sumiu", quando só estava fora da área visível.
    const tabsScrollRef = useRef<HTMLDivElement>(null)
    const activeTabId = enhancedTabs.find((t) => t.isActive)?.id
    useEffect(() => {
        if (!activeTabId || !tabsScrollRef.current) return
        const container = tabsScrollRef.current
        const el = container.querySelector<HTMLElement>(`[data-tab-id="${activeTabId}"]`)
        if (!el) return
        // scrollTo direto no container em vez de el.scrollIntoView({ inline:
        // 'center' }) — esse método, ao tentar centralizar, às vezes sobe
        // pra um ancestral (a página inteira) em vez de ficar só dentro
        // desta faixa de abas, cortando o header inteiro pro lado ao trocar
        // de aba (ex: abrir o dashboard de uma loja). scrollTo aqui nunca
        // sai deste container.
        const elLeft = el.offsetLeft
        const elRight = elLeft + el.offsetWidth
        const viewLeft = container.scrollLeft
        const viewRight = viewLeft + container.clientWidth
        if (elLeft < viewLeft || elRight > viewRight) {
            const target = elLeft - (container.clientWidth - el.offsetWidth) / 2
            container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
        }
    }, [activeTabId])

    // Dentro da casca da 3.0 a navbar e o menu já existem: aqui sobram só o voltar/título, as abas e a busca da página.
    // A linha do voltar + título fica SEMPRE fixa logo abaixo da navbar (não anda com a rolagem); com `pinned`, o bloco inteiro (abas e busca) fica.
    const hasTitleRow = showBack || (title && title !== 'iUser') || locationElement
        const stickStyle = { background: colors.background, top: 'var(--shell-top, 0px)' }
        const titleRow = hasTitleRow ? (
            <div
                // Parado onde nasce (não sobe com a rolagem): sobe 1rem para dentro do respiro do cartão (-mt-4) e o devolve em padding (pt-5), então
                // o botão fica na mesma altura de sempre e o fundo da faixa cobre o respiro acima dele e as laterais (-mx-4 px-4: a largura toda do cartão, que recorta os cantos).
                className={`flex items-center gap-2 ${pinned ? '' : 'sticky z-30 pt-5 pb-2.5 -mt-4 -mx-4 px-4'}`}
                style={{ color: colors.textPrimary, ...(pinned ? {} : stickStyle) }}
            >
                {/* cobre a faixa entre o topo da tela e a linha fixa: sem isto o conteúdo que rola aparece por cima do título */}
                <span aria-hidden className="absolute left-0 right-0 bottom-full pointer-events-none" style={{ height: 'var(--shell-top, 0px)', background: colors.background }} />
                {showBack && (
                    <button
                        onClick={handleBack}
                        aria-label="Voltar"
                        className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition active:scale-95"
                        style={{ background: `${colors.border}50` }}
                    >
                        <ArrowLeft size={18} color={colors.textPrimary} />
                    </button>
                )}
                {title && title !== 'iUser' && (
                    <span className="text-lg font-black truncate" style={{ color: colors.textPrimary }}>{title}</span>
                )}
                {locationElement && <div className="ml-auto flex-shrink-0">{locationElement}</div>}
            </div>
        ) : null
        return (
            <>
                {!pinned && titleRow}
                <div
                    className={`flex flex-col gap-2.5 pb-3 ${pinned ? 'sticky z-30 pt-1' : 'relative z-10 pt-3'}`}
                    style={{ color: colors.textPrimary, ...(pinned ? stickStyle : {}) }}
                >
                {pinned && titleRow}

                {enhancedTabs.length > 0 && <PageTabs tabs={enhancedTabs} />}

                {showSearch && (
                    <div
                        className="flex items-center gap-2 px-3 rounded-full"
                        style={{ height: 46, background: colors.surface, border: `1.5px solid ${isExpanded ? '#f97316' : colors.border}` }}
                        onClick={() => inputRef.current?.focus()}
                    >
                        <Search size={18} style={{ color: colors.accent }} className="flex-shrink-0" />
                        <input
                            ref={inputRef}
                            type="search"
                            inputMode="search"
                            enterKeyHint="done"
                            placeholder={searchPlaceholder}
                            value={currentSearchValue}
                            onChange={(e) => handleSearch(e.target.value)}
                            onFocus={handleFocus}
                            onBlur={handleBlur}
                            onKeyDown={handleKeyDown}
                            className="flex-1 min-w-0 bg-transparent text-sm font-medium focus:outline-none"
                            style={{ color: colors.textPrimary }}
                        />
                        {isSearching && (
                            <button onClick={handleClear} aria-label="Limpar busca" className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ color: colors.accent }}>
                                <X size={16} />
                            </button>
                        )}
                    </div>
                )}
                </div>
            </>
        )
}