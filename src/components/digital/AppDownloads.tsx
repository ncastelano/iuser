// src/components/digital/AppDownloads.tsx — "Baixar": as versões do programa/aplicativo de um produto digital, agrupadas por PLATAFORMA (Windows, macOS, Android...), a mais nova primeiro com o selo
// "Última versão". Cada versão mostra tamanho, data, downloads, as notas e o SHA-256 (para conferir o arquivo). Quem tem acesso (pegou de graça, comprou, ou a versão é de demonstração)
// baixa com um toque; quem não tem vê o que falta. ATUALIZAÇÕES INCLUÍDAS: quem tem o produto abre as versões novas que o autor publicar depois. O iUser ainda não verifica vírus: o aviso fica visível.
'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Apple, Bot, Check, Copy, Download, Globe, Lock, Monitor, Package, Smartphone, Terminal } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { toast } from '@/lib/toast'
import { APP_PLATFORM_LABEL, APP_WARNING, downloadsLabel, fetchAppInfo, formatSize, groupAppsByPlatform, openItem, shortHash, type AppPlatform, type AppVersion } from '@/modules/digital'

const PLATFORM_ICON: Record<AppPlatform, typeof Monitor> = { windows: Monitor, macos: Apple, linux: Terminal, android: Bot, ios: Smartphone, web: Globe, other: Package }

export const APP_CLAIMED_EVENT = 'iuser-digital-claimed'

export default function AppDownloads({ productId, free = false }: { productId: string; free?: boolean }) {
    const { colors } = useTheme()
    const [apps, setApps] = useState<AppVersion[] | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [copied, setCopied] = useState<string | null>(null)
    const [open, setOpen] = useState<string | null>(null)

    const load = useCallback(() => { fetchAppInfo(productId).then(setApps).catch(() => setApps([])) }, [productId])
    useEffect(() => { load() }, [load])
    // "Pegar grátis" na mesma página libera os downloads sem recarregar
    useEffect(() => { const h = () => load(); window.addEventListener(APP_CLAIMED_EVENT, h); return () => window.removeEventListener(APP_CLAIMED_EVENT, h) }, [load])

    if (!apps || apps.length === 0) return null
    const groups = groupAppsByPlatform(apps)

    const download = async (v: AppVersion) => {
        setBusy(v.item_id)
        try { const d = await openItem(v.item_id, true); window.location.href = d.url; setTimeout(load, 1500) } catch (e: any) { toast.error(e?.message || 'Não foi possível baixar.') } finally { setBusy(null) }
    }
    const copy = async (v: AppVersion) => { if (!v.sha256) return; try { await navigator.clipboard.writeText(v.sha256); setCopied(v.item_id); setTimeout(() => setCopied(null), 1800) } catch { toast.error('Não foi possível copiar.') } }

    return (
        <section id="baixar-programa" className="rounded-3xl p-4 flex flex-col gap-3" style={{ background: colors.surface, border: `1px solid ${colors.border}` }}>
            <div>
                <h2 className="text-base font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Download size={16} style={{ color: '#f97316' }} /> Baixar</h2>
                <p className="text-[12px]" style={{ color: colors.textSecondary }}>Versões por plataforma. Quem tem o produto recebe as atualizações novas sem pagar de novo.</p>
            </div>
            {groups.map((g) => {
                const Icon = PLATFORM_ICON[g.platform] || Package
                return (
                    <div key={g.platform} className="flex flex-col gap-2">
                        <p className="text-[11px] font-black uppercase tracking-wide flex items-center gap-1.5" style={{ color: colors.textSecondary }}><Icon size={13} /> {APP_PLATFORM_LABEL[g.platform]}</p>
                        {g.versions.map((v) => (
                            <div key={v.item_id} className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: `${colors.border}30`, border: v.latest ? '1.5px solid #f9731660' : '1.5px solid transparent' }}>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="min-w-[10.5rem] flex-1">
                                        <p className="text-sm font-black flex items-center gap-1.5 flex-wrap" style={{ color: colors.textPrimary }}>
                                            Versão {v.version}
                                            {v.latest && <span className="text-[10px] font-black rounded-full px-2 py-0.5 text-white" style={{ background: '#f97316' }}>Última versão</span>}
                                        </p>
                                        <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                                            {[formatSize(v.size_bytes), new Date(v.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }), downloadsLabel(v.download_count)].filter(Boolean).join(' · ')}
                                        </p>
                                    </div>
                                    {v.unlocked ? (
                                        <button type="button" disabled={busy === v.item_id} onClick={() => download(v)} className="h-10 px-4 rounded-full text-[13px] font-black text-white inline-flex items-center gap-1.5 flex-shrink-0 active:scale-95 disabled:opacity-60" style={{ background: '#f97316' }}>
                                            <Download size={15} /> {busy === v.item_id ? 'Baixando…' : 'Baixar'}
                                        </button>
                                    ) : (
                                        <span className="h-10 px-3 rounded-full text-[12px] font-black inline-flex items-center gap-1.5 flex-shrink-0" style={{ background: `${colors.border}55`, color: colors.textSecondary }}><Lock size={13} /> {free ? 'Pegue grátis' : 'Compre'} para baixar</span>
                                    )}
                                </div>
                                {v.release_notes && (
                                    <button type="button" onClick={() => setOpen(open === v.item_id ? null : v.item_id)} className="text-left text-[12px]" style={{ color: colors.textPrimary }}>
                                        <span className="font-black">O que mudou: </span>
                                        <span style={{ color: colors.textSecondary }}>{open === v.item_id || v.release_notes.length <= 90 ? v.release_notes : `${v.release_notes.slice(0, 90)}… ver mais`}</span>
                                    </button>
                                )}
                                {v.sha256 && (
                                    <button type="button" onClick={() => copy(v)} className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold text-left" style={{ color: colors.textSecondary }} title={v.sha256}>
                                        {copied === v.item_id ? <Check size={12} className="flex-shrink-0" style={{ color: '#16a34a' }} /> : <Copy size={12} className="flex-shrink-0" />}<span className="whitespace-nowrap">SHA-256</span> <span className="font-mono whitespace-nowrap">{shortHash(v.sha256)}</span> <span className="opacity-70 whitespace-nowrap">{copied === v.item_id ? 'copiado' : 'copiar'}</span>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )
            })}
            <p className="text-[11px] flex items-start gap-1.5 rounded-xl p-2.5" style={{ background: '#f59e0b14', color: colors.textSecondary }}><AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#d97706' }} /> {APP_WARNING}</p>
        </section>
    )
}
