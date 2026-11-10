// src/components/AceitarCorridas/LocationAskDialog.tsx
//
// Pergunta ao motorista, num diálogo, se podemos procurar a localização dele (para somar à Tarifa iUser o deslocamento até a partida).
// Ao aceitar o diálogo fecha sozinho e o valor das corridas se atualiza; "Agora não" fecha e vale só nesta visita.
// "Digitar o local" (opcional, `onType`): antes de abrir o campo de endereço, AVISA o risco — o valor passa a ser medido desse ponto, não de
// onde o motorista está: longe demais do pedido cobra deslocamento à toa (o passageiro acha caro e escolhe outro); perto demais do passageiro
// sem estar lá barateia a corrida e ele roda até a partida sem receber por isso.
'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Keyboard, LocateFixed } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { Spinner } from '@/components/Spinner'

export type GeoAskStatus = 'idle' | 'asking' | 'denied' | 'unavailable'

const DISMISS_KEY = 'iuser_loc_ask_dismissed'
export const wasLocationAskDismissed = (): boolean => { try { return sessionStorage.getItem(DISMISS_KEY) === '1' } catch { return false } }
export const rememberLocationAskDismissed = () => { try { sessionStorage.setItem(DISMISS_KEY, '1') } catch { /* sem armazenamento: só pergunta de novo */ } }

/** O navegador já deixou usar a localização? Então não precisa perguntar (nem aparecer diálogo): é só buscar. */
export async function isGeoPermissionGranted(): Promise<boolean> {
    try {
        const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
        return p?.state === 'granted'
    } catch { return false }
}

export default function LocationAskDialog({ open, status, onAllow, onLater, onType }: { open: boolean; status: GeoAskStatus; onAllow: () => void; onLater: () => void; onType?: () => void }) {
    const { colors } = useTheme()
    const [warn, setWarn] = useState(false)
    useEffect(() => { if (!open) setWarn(false) }, [open])
    if (!open || typeof document === 'undefined') return null
    const asking = status === 'asking'
    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Usar sua localização">
            <div className="absolute inset-0 bg-black/55" />
            <div className="relative w-full max-w-sm rounded-3xl p-5" style={{ background: colors.background, color: colors.textPrimary, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
                {warn && onType ? (
                    <>
                        <span className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ background: '#f59e0b22', color: '#d97706' }}><AlertTriangle size={22} /></span>
                        <h2 className="text-lg font-black leading-tight">Digitar o local tem um risco</h2>
                        <p className="text-sm mt-1.5 leading-snug" style={{ color: colors.textSecondary }}>
                            O valor de cada corrida passa a ser medido <strong style={{ color: colors.textPrimary }}>a partir do local que você digitar</strong>, não de onde você está de verdade.
                        </p>
                        <div className="mt-3 flex flex-col gap-2">
                            <div className="rounded-2xl p-3 text-[12.5px] leading-snug" style={{ background: '#f59e0b14', border: '1px solid #f59e0b55' }}>
                                <b>Longe do pedido:</b> soma um deslocamento que você não vai fazer. O valor fica mais alto à toa e o passageiro pode escolher outro motorista.
                            </div>
                            <div className="rounded-2xl p-3 text-[12.5px] leading-snug" style={{ background: '#ef444412', border: '1px solid #ef444455' }}>
                                <b>Perto do passageiro sem estar lá:</b> o valor fica barato demais e você roda até a partida sem receber por isso.
                            </div>
                        </div>
                        <p className="text-xs font-bold mt-3" style={{ color: colors.textSecondary }}>Digite onde você realmente está agora, e troque quando sair de lá. Com o GPS isso acontece sozinho.</p>
                        <button onClick={() => { setWarn(false); onType() }} className="mt-4 w-full h-12 rounded-full text-sm font-black text-white transition active:scale-[0.98]" style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>Entendi, digitar o local</button>
                        <button onClick={() => { setWarn(false); onAllow() }} className="mt-1.5 w-full h-11 rounded-full text-sm font-bold" style={{ color: colors.textPrimary }}>Usar o GPS</button>
                    </>
                ) : (
                <>
                <span className="w-12 h-12 rounded-full flex items-center justify-center text-white mb-3" style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>
                    {asking ? <Spinner size={20} color="#fff" /> : <LocateFixed size={22} />}
                </span>
                <h2 className="text-lg font-black leading-tight">{asking ? 'Localizando você...' : 'Podemos usar a sua localização?'}</h2>
                <p className="text-sm mt-1.5 leading-snug" style={{ color: colors.textSecondary }}>
                    Usamos para ajustar o valor da <strong style={{ color: colors.textPrimary }}>Tarifa iUser</strong>: se você estiver longe do ponto de partida, somamos esse deslocamento ao valor, para você não perder dinheiro rodando até o passageiro.
                </p>
                {asking && <p className="text-xs font-bold mt-2" style={{ color: colors.textSecondary }}>Permita a localização quando o navegador perguntar.</p>}
                {status === 'denied' && <p className="text-xs font-bold mt-2" style={{ color: '#ca8a04' }}>A localização está bloqueada. Libere nas configurações do navegador (ou do app) e toque em tentar de novo.</p>}
                {status === 'unavailable' && <p className="text-xs font-bold mt-2" style={{ color: '#ca8a04' }}>Não conseguimos obter sua localização agora. Tente de novo.</p>}
                <button onClick={onAllow} disabled={asking} className="mt-4 w-full h-12 rounded-full text-sm font-black text-white transition active:scale-[0.98] disabled:opacity-60" style={{ background: 'linear-gradient(135deg, #f97316, #dc2626)' }}>
                    {status === 'denied' || status === 'unavailable' ? 'Tentar de novo' : 'Permitir localização'}
                </button>
                {onType && !asking && (
                    <button onClick={() => setWarn(true)} className="mt-2 w-full h-11 rounded-full text-sm font-black flex items-center justify-center gap-1.5 transition active:scale-[0.98]" style={{ border: `1px solid ${colors.border}`, color: colors.textPrimary }}>
                        <Keyboard size={15} />Digitar o local
                    </button>
                )}
                <button onClick={onLater} className="mt-1.5 w-full h-11 rounded-full text-sm font-bold" style={{ color: colors.textSecondary }}>Agora não</button>
                </>
                )}
            </div>
        </div>,
        document.body,
    )
}
