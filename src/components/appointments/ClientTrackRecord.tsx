// src/components/appointments/ClientTrackRecord.tsx
//
// Respaldo para o dono do serviço: o histórico do cliente que agendou. Mostra o que OUTROS donos de serviço disseram dele e o que ele
// mesmo disse dos serviços que usou. Só o prestador de um agendamento daquele cliente consegue ler (get_client_track_record).
'use client'

import { useEffect, useState } from 'react'
import { getTrackRecord, type TrackRecord } from '@/lib/appointmentReviews'
import Stars from './Stars'
import type { ReviewPalette } from './AppointmentReviewPanel'

const day = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')

export default function ClientTrackRecord({ clientId, palette }: { clientId: string; palette: ReviewPalette }) {
    const [rec, setRec] = useState<TrackRecord | null | undefined>(undefined)
    const c = palette
    useEffect(() => { let alive = true; getTrackRecord(clientId).then((r) => { if (alive) setRec(r) }, () => { if (alive) setRec(null) }); return () => { alive = false } }, [clientId])

    if (rec === undefined) return <p style={{ color: c.textSecondary, fontSize: 12 }}>Carregando histórico…</p>
    if (!rec) return null
    const empty = rec.by_owners.length === 0 && rec.own_comments.length === 0
    const label = (t: string) => <p style={{ color: c.textSecondary, fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', margin: '12px 0 6px' }}>{t}</p>
    const item = (key: string, stars: number, who: string, text: string | null, extra: string) => (
        <div key={key} style={{ padding: '8px 10px', borderRadius: 12, background: `${c.border}22`, marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: c.textPrimary, fontSize: 12.5, fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who}</span>
                <Stars value={stars} size={13} />
            </div>
            {text && <p style={{ color: c.textPrimary, fontSize: 12.5, marginTop: 3 }}>“{text}”</p>}
            <p style={{ color: c.textSecondary, fontSize: 11, marginTop: 2 }}>{extra}</p>
        </div>
    )
    return (
        <div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ color: c.textPrimary, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {rec.summary.count > 0 ? <><Stars value={rec.summary.avg} size={14} /> {String(rec.summary.avg).replace('.', ',')} <span style={{ color: c.textSecondary, fontWeight: 600 }}>({rec.summary.count} {rec.summary.count === 1 ? 'dono avaliou' : 'donos avaliaram'})</span></> : <span style={{ color: c.textSecondary, fontWeight: 600 }}>Nenhum dono avaliou ainda</span>}
                </span>
                <span style={{ color: c.textSecondary, fontSize: 12 }}>{rec.services_done} {rec.services_done === 1 ? 'serviço feito' : 'serviços feitos'}</span>
            </div>
            {empty && <p style={{ color: c.textSecondary, fontSize: 12, marginTop: 8 }}>Ainda não há avaliações nem comentários dessa pessoa.</p>}
            {rec.by_owners.length > 0 && (<>
                {label('O que donos de serviço disseram')}
                {rec.by_owners.map((r, i) => item(`o${i}`, r.rating, r.mine ? 'Você' : (r.owner_name || (r.owner_slug ? `@${r.owner_slug}` : 'Dono de serviço')), r.comment, `${r.service_name || 'Serviço'} · ${day(r.created_at)}`))}
            </>)}
            {rec.own_comments.length > 0 && (<>
                {label('O que a pessoa disse dos serviços')}
                {rec.own_comments.map((r, i) => item(`c${i}`, r.rating, r.store_name || 'Serviço', r.comment, `${r.service_name || 'Serviço'} · ${day(r.created_at)}`))}
            </>)}
        </div>
    )
}
