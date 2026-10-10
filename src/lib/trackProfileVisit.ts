// src/lib/trackProfileVisit.ts
//
// Conta uma visita no perfil de uma pessoa (profiles.view_count + a lista de visitantes do dono), pela função do banco
// record_profile_visit — que já ignora a mesma sessão repetida em menos de 60 s. Vale: abrir o perfil (link direto, clique
// no card do /social, resultado da busca, "últimos acessados") e passar o mouse por cima do card do perfil.
// A própria pessoa vendo o próprio perfil não conta.
import { supabase } from '@/lib/supabase/client'

function getSessionId(): string {
    try {
        const key = 'iuser_session_id'
        let id = sessionStorage.getItem(key)
        if (!id) {
            id = crypto.randomUUID()
            sessionStorage.setItem(key, id)
        }
        return id
    } catch {
        return crypto.randomUUID()
    }
}

function getAnonymousId(): string {
    try {
        const key = 'iuser_anon_id'
        let id = localStorage.getItem(key)
        if (!id) {
            id = crypto.randomUUID()
            localStorage.setItem(key, id)
        }
        return id
    } catch {
        return crypto.randomUUID()
    }
}

function getDeviceType(): 'mobile' | 'tablet' | 'desktop' {
    const ua = navigator.userAgent
    if (/iPad|Tablet/i.test(ua)) return 'tablet'
    if (/Mobi|Android|iPhone/i.test(ua)) return 'mobile'
    return 'desktop'
}

// Evita chamar o banco várias vezes seguidas pro mesmo perfil (passar o mouse várias vezes)
const lastSent = new Map<string, number>()
const COOLDOWN_MS = 60_000

/** Registra a visita; devolve true se o banco contou (false = repetida, a própria pessoa ou erro). */
export async function trackProfileVisit(profileId: string | null | undefined, viewerId?: string | null): Promise<boolean> {
    if (!profileId || typeof window === 'undefined') return false
    if (viewerId && viewerId === profileId) return false
    const now = Date.now()
    const last = lastSent.get(profileId)
    if (last && now - last < COOLDOWN_MS) return false
    lastSent.set(profileId, now)
    try {
        const { data, error } = await supabase.rpc('record_profile_visit', {
            p_profile_id: profileId,
            p_session_id: getSessionId(),
            p_viewer_id: viewerId || null,
            p_anonymous_id: viewerId ? null : getAnonymousId(),
            p_device_type: getDeviceType(),
            p_referrer: document.referrer || null,
            p_user_agent: navigator.userAgent || null,
        })
        if (error) return false
        return data === true
    } catch {
        return false
    }
}
