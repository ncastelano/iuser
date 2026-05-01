import { useState, useEffect, useMemo } from 'react'
import { Mode } from './useMapData'

export function useMapFilters(stores: any[], products: any[]) {
    const [mode, setMode] = useState<Mode>('lojas')
    const [search, setSearch] = useState('')
    const [overrideList, setOverrideList] = useState<any[] | null>(null)
    const [showFilters, setShowFilters] = useState(false)

    const filtered = useMemo(() => {
        if (overrideList) return overrideList

        let items: any[] = []
        if (mode === 'lojas') {
            items = stores
        } else if (mode === 'servicos') {
            items = products.filter(p => p.type === 'service')
        } else if (mode === 'produtos') {
            items = products.filter(p => p.type === 'physical')
        }

        const q = search.toLowerCase()
        return q ? items.filter(i => i.name?.toLowerCase().includes(q)) : items
    }, [search, mode, stores, products, overrideList])

    const resetFilters = () => {
        setSearch('')
        setOverrideList(null)
    }

    const changeMode = (newMode: Mode) => {
        setMode(newMode)
        setOverrideList(null)
    }

    return {
        mode,
        setMode: changeMode,
        search,
        setSearch,
        overrideList,
        setOverrideList,
        showFilters,
        setShowFilters,
        filtered,
        resetFilters,
    }
}