// src/hooks/useFreeTrial.ts
//
// O brinde do Pré-pago (teste grátis, 90 dias por padrão): a configuração do admin
// (ligado/duração), o resgate da pessoa (uma vez por conta) e se o teste está ativo.
// Compartilhado pelo card do ProfileDashboard, pelas páginas de planos e pela home.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useProfile } from '@/app/contexts/ProfileContext'
import { getDeviceId } from '@/lib/deviceId'
import { resetPlanRingCache } from '@/lib/planRing'

export const DEFAULT_TRIAL_DAYS = 90

export interface FreeTrialSettings {
    enabled: boolean
    durationDays: number
}

// "90 dias" — o texto usado em todos os cards
export function trialDaysLabel(days: number): string {
    return `${days} ${days === 1 ? 'dia' : 'dias'}`
}

// Só a configuração (leve): quem só precisa do texto "N dias grátis" (ex: card da home).
export function useFreeTrialSettings() {
    const [settings, setSettings] = useState<FreeTrialSettings>({ enabled: true, durationDays: DEFAULT_TRIAL_DAYS })
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        let cancelled = false
        supabase
            .from('free_trial_settings')
            .select('enabled, duration_days')
            .eq('id', 1)
            .maybeSingle()
            .then(({ data }) => {
                if (cancelled) return
                // Sem a tabela/linha (migration não rodou): mantém o padrão ligado.
                if (data) setSettings({ enabled: !!data.enabled, durationDays: data.duration_days || DEFAULT_TRIAL_DAYS })
                setLoaded(true)
            })
        return () => { cancelled = true }
    }, [])

    return { settings, loaded }
}

export type ClaimResult = { ok: true } | { ok: false; needsCpf?: boolean; error?: string }

export function useFreeTrial() {
    const { userId, loading: profileLoading } = useProfile()
    const { settings, loaded: settingsLoaded } = useFreeTrialSettings()
    const [loading, setLoading] = useState(true)
    const [claim, setClaim] = useState<{ claimed_at: string; ends_at: string } | null>(null)
    // Pré-pago ativo: gratuito (brinde) ou pago
    const [prepaid, setPrepaid] = useState<{ source: string; endsAt: string | null } | null>(null)
    const [claiming, setClaiming] = useState(false)

    const load = useCallback(async () => {
        if (!userId) {
            setClaim(null)
            setPrepaid(null)
            setLoading(false)
            return
        }
        const [{ data: claimData }, { data: plan }] = await Promise.all([
            supabase.from('free_trial_claims').select('claimed_at, ends_at').eq('profile_id', userId).maybeSingle(),
            supabase.from('plans').select('id').eq('code', 'pre_pago').maybeSingle(),
        ])
        setClaim(claimData || null)
        if (plan) {
            const { data: subs } = await supabase
                .from('subscriptions')
                .select('source, current_period_end')
                .eq('user_id', userId)
                .eq('plan_id', plan.id)
                .eq('status', 'active')
            const now = Date.now()
            const row = (subs || []).find((s: any) => s.current_period_end && new Date(s.current_period_end).getTime() > now)
            setPrepaid(row ? { source: row.source, endsAt: row.current_period_end } : null)
        } else {
            setPrepaid(null)
        }
        setLoading(false)
    }, [userId])

    useEffect(() => {
        if (profileLoading) return
        load()
    }, [profileLoading, load])

    // Resgata o brinde. needsCpf: a conta ainda não tem CPF/CNPJ (a trava contra repetir o resgate).
    const claimTrial = useCallback(async (cpfCnpj?: string): Promise<ClaimResult> => {
        setClaiming(true)
        try {
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return { ok: false, error: 'Entre na sua conta pra resgatar' }
            const res = await fetch('/api/subscriptions/free-trial', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ cpfCnpj, deviceId: getDeviceId() }),
            })
            const json = await res.json()
            if (!res.ok) return { ok: false, needsCpf: !!json.needsCpf, error: json.error }
            await load()
            // Entrar no Pré-pago pode dar uma borda de avatar (concedida por trigger): atualiza a que aparece
            resetPlanRingCache()
            return { ok: true }
        } catch (err: any) {
            return { ok: false, error: err.message || 'Erro ao resgatar' }
        } finally {
            setClaiming(false)
        }
    }, [load])

    const trialActive = prepaid?.source === 'free_trial'
    const paidPrepaid = !!prepaid && prepaid.source !== 'free_trial'
    const trialEnded = !!claim && !trialActive

    return {
        settings,
        loading: loading || !settingsLoaded || profileLoading,
        userId,
        claim,
        prepaid,
        trialActive,
        paidPrepaid,
        trialEnded,
        claiming,
        claimTrial,
        reload: load,
    }
}
