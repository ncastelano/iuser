// src/hooks/useFeatureFlag.ts
//
// Lê uma chave liga/desliga da plataforma (tabela feature_flags, controlada pelo administrador).
// Enquanto carrega — ou se a chave não existir — devolve `false`: recurso escondido por padrão.
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export function useFeatureFlag(key: string): boolean {
    const [enabled, setEnabled] = useState(false)
    useEffect(() => {
        let cancelled = false
        supabase.from('feature_flags').select('enabled').eq('key', key).maybeSingle().then(({ data }) => {
            if (!cancelled) setEnabled(!!(data as { enabled?: boolean } | null)?.enabled)
        })
        return () => { cancelled = true }
    }, [key])
    return enabled
}
