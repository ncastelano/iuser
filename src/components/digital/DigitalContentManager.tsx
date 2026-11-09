// src/components/digital/DigitalContentManager.tsx — o vendedor monta o conteúdo do produto digital: sobe arquivos (vídeo-aula, PDF, planilha...) ou cola links,
// agrupa em módulos, marca "aula grátis" (prévia na vitrine) e ordena. Os arquivos vão para o R2 PRIVADO do digital quando ele está pronto (sem cobrança de banda) e, senão, para os buckets PRIVADOS do Supabase (digital-files/music/apps), na pasta da própria pessoa.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Link2, Package, Trash2, Upload } from 'lucide-react'
import { useTheme } from '@/app/contexts/theme'
import { useProfile } from '@/app/contexts/ProfileContext'
import { toast } from '@/lib/toast'
import { addAppItem, addFileItem, addLinkItem, APP_NOTES_MAX, APP_PLATFORM_LABEL, APP_PLATFORMS, APP_VERSION_MAX, declareRights, detectPlatform, downloadsLabel, hasRights, kindFromFile, PROGRAM_ACCEPT, validateAppInput, type AppPlatform, formatDuration, formatSize, groupByModule, listOwnItems, removeItem, setItemPreview, swapItems, curriculumSummary, type OwnItem, type CurriculumItem } from '@/modules/digital'
import { kindIcon } from './DigitalCurriculum'
import MySpace from '@/components/uploads/MySpace'
import { fetchMyUploadLimits } from '@/lib/myUploadLimits'
import { bucketForKind, DIGITAL_HEAVY_KIND, DIGITAL_UPLOAD_KIND, fetchDigitalKind, saveDigitalKind, type DigitalProductKind } from '@/modules/digital'
import DigitalKindPicker from './DigitalKindPicker'
import { r2Availability, type R2Availability } from '@/lib/r2Upload'
import { heavyUploadInfo } from '@/lib/r2Types'
import { checkFitsLimit, ruleText, type UploadLimit } from '@/modules/uploads'

export default function DigitalContentManager({ productId }: { productId: string }) {
    const { colors } = useTheme()
    const { userId } = useProfile()
    const [items, setItems] = useState<OwnItem[]>([])
    const [kind, setKind] = useState<DigitalProductKind | null>(null)         // o tipo de conteúdo escolhido pelo lojista (prateleira da loja)
    useEffect(() => { fetchDigitalKind(productId).then(setKind).catch(() => {}) }, [productId])
    const chooseKind = async (k: DigitalProductKind) => {
        const before = kind
        setKind(k)
        try { await saveDigitalKind(productId, k); toast.success('Tipo de conteúdo salvo') } catch (e) { setKind(before); toast.error(e instanceof Error ? e.message : 'Não foi possível salvar o tipo.') }
    }
    const [busy, setBusy] = useState(false)
    const [title, setTitle] = useState('')
    const [moduleTitle, setModuleTitle] = useState('')
    const [url, setUrl] = useState('')
    const [preview, setPreview] = useState(false)
    const [teaser, setTeaser] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)
    // Programa ou aplicativo para baixar: um arquivo por plataforma e versão
    const appFileRef = useRef<HTMLInputElement>(null)
    const [appFile, setAppFile] = useState<File | null>(null)
    const [appPlatform, setAppPlatform] = useState<AppPlatform | ''>('')
    const [appVersion, setAppVersion] = useState('')
    const [appNotes, setAppNotes] = useState('')
    const [appDemo, setAppDemo] = useState(false)
    // Limites de cada tipo de envio (do banco) e quanto já foi usado: mostrados antes de enviar e conferidos antes de subir o arquivo
    const [limits, setLimits] = useState<Record<string, UploadLimit> | null>(null)
    const reloadLimits = useCallback(async () => { setLimits(await fetchMyUploadLimits()) }, [])
    useEffect(() => { reloadLimits() }, [reloadLimits])
    // O R2 privado do digital está pronto (configurado no servidor E o tipo ligado)? Então todo arquivo novo vai para lá; senão, o plano B é o armazenamento comum (limites menores)
    const [heavy, setHeavy] = useState<R2Availability | null>(null)
    useEffect(() => { r2Availability(DIGITAL_HEAVY_KIND).then(setHeavy) }, [])
    const useR2 = heavy?.available === true
    const [progress, setProgress] = useState<number | null>(null)
    // Autoria: para enviar ÁUDIO o dono declara, uma vez por produto, que a obra é dele (ou licenciada)
    const [declared, setDeclared] = useState<boolean | null>(null)
    const [rightsChecked, setRightsChecked] = useState(false)
    useEffect(() => { hasRights(productId).then(setDeclared) }, [productId])

    const load = useCallback(async () => { try { setItems(await listOwnItems(productId)); reloadLimits() } catch (e: any) { toast.error(e.message) } }, [productId, reloadLimits])
    useEffect(() => { load() }, [load])

    const run = async (fn: () => Promise<void>, ok?: string) => {
        setBusy(true)
        try { await fn(); if (ok) toast.success(ok); await load() } catch (e: any) { toast.error(e?.message || 'Não deu certo.') } finally { setBusy(false); setProgress(null) }
    }
    const onFile = (f: File | undefined) => {
        if (!f || !userId) return
        const fileKind = kindFromFile(f.type, f.name)
        const toR2 = useR2 && !!heavyUploadInfo(f.type, f.name)   // formato fora da lista do R2 (ex.: imagem): segue pelo armazenamento comum, se couber
        const lim = toR2 ? limits?.[DIGITAL_HEAVY_KIND] : limits?.[DIGITAL_UPLOAD_KIND[bucketForKind(fileKind)]]
        const tooBig = checkFitsLimit(lim, f.size, fileKind === 'audio' ? 'áudio' : 'arquivo')
        if (tooBig) { toast.error(tooBig); if (fileRef.current) fileRef.current.value = ''; return }
        const isAudio = fileKind === 'audio'
        if (isAudio && !declared && !rightsChecked) { toast.error('Marque a declaração de autoria para enviar música.'); if (fileRef.current) fileRef.current.value = ''; return }
        run(async () => {
            if (isAudio && !declared) { await declareRights(productId); setDeclared(true) }
            await addFileItem({ uid: userId, productId, file: f, title: title.trim() || (teaser ? 'Prévia da vitrine' : f.name.replace(/\.[^.]+$/, '')), moduleTitle: teaser ? undefined : moduleTitle, isPreview: preview, isTeaser: teaser, maxBytes: lim?.maxBytes, useR2: toR2, onProgress: setProgress })
            setTitle(''); setPreview(false); setTeaser(false)
        }, teaser ? 'Prévia da vitrine enviada ✓' : 'Arquivo enviado ✓')
        if (fileRef.current) fileRef.current.value = ''
    }

    const pickApp = (f: File | undefined) => {
        if (!f) return
        setAppFile(f)
        setAppPlatform((cur) => cur || detectPlatform(f.name) || '')
        if (appFileRef.current) appFileRef.current.value = ''
    }
    const sendApp = () => {
        if (!userId || !appFile) { toast.error('Escolha o arquivo do programa.'); return }
        const err = validateAppInput({ fileName: appFile.name, size: appFile.size, platform: appPlatform, version: appVersion, notes: appNotes })
        if (err) { toast.error(err); return }
        const appToR2 = useR2 && !!heavyUploadInfo(appFile.type, appFile.name)
        const appLimit = appToR2 ? limits?.[DIGITAL_HEAVY_KIND] : limits?.digital_app
        const appFit = checkFitsLimit(appLimit, appFile.size, 'programa')
        if (appFit) { toast.error(appFit); return }
        if (!declared && !rightsChecked) { toast.error('Marque a declaração de autoria para enviar programas.'); return }
        run(async () => {
            if (!declared) { await declareRights(productId); setDeclared(true) }
            await addAppItem({ uid: userId, productId, file: appFile, platform: appPlatform as AppPlatform, version: appVersion, notes: appNotes, isPreview: appDemo, maxBytes: appLimit?.maxBytes, useR2: appToR2, onProgress: setProgress })
            setAppFile(null); setAppVersion(''); setAppNotes(''); setAppDemo(false)
        }, 'Versão publicada ✓ (quem já tem o produto recebe a atualização)')
    }

    const field = 'w-full h-11 rounded-full px-4 text-sm outline-none'
    const fs = { background: `${colors.border}26`, color: colors.textPrimary, border: `1px solid ${colors.border}` }
    const asCurriculum: CurriculumItem[] = items.filter((i) => !i.is_teaser).map((i) => ({ ...i, unlocked: true }))
    return (
        <div className="flex flex-col gap-3">
            <div>
                <p className="text-sm font-black" style={{ color: colors.textPrimary }}>Conteúdo digital</p>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>{curriculumSummary(asCurriculum)}. Quem comprar abre tudo aqui depois que você confirmar o pagamento; o item marcado como grátis qualquer pessoa assiste. <b>Preço R$ 0 = produto grátis</b>: a pessoa o adiciona à biblioteca e abre na hora, sem pedido.</p>
            </div>

            <div>
                <p className="text-sm font-black mb-2" style={{ color: colors.textPrimary }}>Que tipo de conteúdo é?</p>
                <DigitalKindPicker value={kind} onChange={chooseKind} />
            </div>

            <MySpace limits={limits} kinds={useR2 ? [DIGITAL_HEAVY_KIND] : ['digital_music', 'digital_app', 'digital_file']} title="Meu espaço (regras de tamanho e quanto você já usou)" />

            <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: `${colors.border}1f`, border: `1px solid ${colors.border}` }}>
                <input className={field} style={fs} placeholder="Nome da aula ou do arquivo" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
                <input className={field} style={fs} placeholder="Módulo (opcional) — ex.: Módulo 1 · Primeiros passos" value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} maxLength={100} list={`mods-${productId}`} />
                <datalist id={`mods-${productId}`}>{groupByModule(items).filter((g) => g.title).map((g) => <option key={g.title} value={g.title!} />)}</datalist>
                <label className="flex items-center gap-2 text-[12px] font-bold cursor-pointer" style={{ color: colors.textPrimary }}>
                    <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={preview && !teaser} disabled={teaser} onChange={(e) => setPreview(e.target.checked)} /> Aula grátis (aparece aberta na vitrine)
                </label>
                <label className="flex items-start gap-2 text-[12px] font-bold cursor-pointer" style={{ color: colors.textPrimary }}>
                    <input type="checkbox" className="w-4 h-4 mt-0.5 accent-orange-500" checked={teaser} onChange={(e) => setTeaser(e.target.checked)} />
                    <span>É a <b>prévia</b> (vídeo ou áudio de até 30 s). <b>Vídeo:</b> passa sozinho nos cartões da home e toca 15 s quando a pessoa passa o mouse ou segura o dedo. <b>Música (áudio):</b> aparece como "Ouvir prévia" na página do produto, aberta a todos. Não faz parte do que o cliente compra.</span>
                </label>
                {declared === false && (
                    <label className="flex items-start gap-2 text-[12px] font-bold cursor-pointer rounded-xl p-2" style={{ color: colors.textPrimary, background: '#f9731612', border: '1px solid #f9731640' }}>
                        <input type="checkbox" className="w-4 h-4 mt-0.5 accent-orange-500" checked={rightsChecked} onChange={(e) => setRightsChecked(e.target.checked)} />
                        <span><b>Declaração de autoria (músicas e programas).</b> Declaro que as músicas ou os programas deste produto são de minha autoria — ou que tenho licença para vendê-los e distribuí-los no iUser —, que os programas não contêm vírus nem código malicioso e que respondo por eles. Fica registrado.</span>
                    </label>
                )}
                <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="flex-1 h-11 rounded-full text-sm font-black inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: '#f97316', color: '#fff' }}>
                        <Upload size={16} /> {busy ? (progress != null ? `Enviando ${progress}%` : 'Enviando…') : 'Enviar arquivo'}
                    </button>
                    <input ref={fileRef} type="file" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                </div>
                <div className="flex gap-2">
                    <input className={field} style={fs} placeholder="ou cole um link https:// (aula hospedada fora)" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" />
                    <button type="button" disabled={busy || !url.trim() || !userId} className="h-11 px-4 rounded-full text-sm font-black inline-flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0" style={{ background: `${colors.border}55`, color: colors.textPrimary }}
                        onClick={() => run(async () => { await addLinkItem({ uid: userId!, productId, url, title: title.trim() || 'Link', moduleTitle, isPreview: preview }); setUrl(''); setTitle(''); setPreview(false) }, 'Link adicionado ✓')}>
                        <Link2 size={16} /> Adicionar
                    </button>
                </div>
            </div>

            <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: `${colors.border}1f`, border: `1px solid ${colors.border}` }}>
                <p className="text-sm font-black flex items-center gap-1.5" style={{ color: colors.textPrimary }}><Package size={15} style={{ color: '#f97316' }} /> Programa ou aplicativo para baixar</p>
                <p className="text-[11px]" style={{ color: colors.textSecondary }}>Um arquivo por plataforma e versão (.exe, .msi, .dmg, .apk, .zip...). Publicar uma versão nova libera a atualização para quem já tem o produto. {(useR2 ? limits?.[DIGITAL_HEAVY_KIND] : limits?.digital_app) ? `Regras: ${ruleText((useR2 ? limits?.[DIGITAL_HEAVY_KIND] : limits?.digital_app)!)}.` : ''}</p>
                <button type="button" disabled={busy} onClick={() => appFileRef.current?.click()} className="h-11 rounded-full text-sm font-black inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: `${colors.border}55`, color: colors.textPrimary }}>
                    <Upload size={16} /> {appFile ? `${appFile.name} (${formatSize(appFile.size)})` : 'Escolher arquivo do programa'}
                </button>
                <input ref={appFileRef} type="file" accept={PROGRAM_ACCEPT} hidden onChange={(e) => pickApp(e.target.files?.[0])} />
                <div className="flex gap-2">
                    <select value={appPlatform} onChange={(e) => setAppPlatform(e.target.value as AppPlatform | '')} className={`${field} flex-1`} style={fs} aria-label="Plataforma">
                        <option value="">Plataforma…</option>
                        {APP_PLATFORMS.map((pl) => <option key={pl.code} value={pl.code}>{pl.label}</option>)}
                    </select>
                    <input className={`${field} flex-1`} style={fs} placeholder="Versão (ex.: 1.0.2)" value={appVersion} onChange={(e) => setAppVersion(e.target.value)} maxLength={APP_VERSION_MAX} />
                </div>
                <textarea className="rounded-2xl p-3 text-sm outline-none resize-none" style={fs} rows={2} placeholder="O que mudou nesta versão? (opcional)" value={appNotes} onChange={(e) => setAppNotes(e.target.value.slice(0, APP_NOTES_MAX))} />
                <label className="flex items-center gap-2 text-[12px] font-bold cursor-pointer" style={{ color: colors.textPrimary }}>
                    <input type="checkbox" className="w-4 h-4 accent-orange-500" checked={appDemo} onChange={(e) => setAppDemo(e.target.checked)} /> Versão de demonstração (qualquer pessoa baixa, sem pegar nem comprar)
                </label>
                <button type="button" disabled={busy || !appFile} onClick={sendApp} className="h-11 rounded-full text-sm font-black text-white disabled:opacity-50" style={{ background: '#f97316' }}>{busy ? (progress != null ? `Enviando ${progress}%` : 'Enviando…') : 'Publicar esta versão'}</button>
            </div>

            {items.length === 0 ? (
                <p className="text-[12px] text-center py-2" style={{ color: colors.textSecondary }}>Nenhum conteúdo ainda. Envie o primeiro arquivo acima.</p>
            ) : groupByModule(items).map((g, gi) => (
                <div key={gi} className="flex flex-col gap-1.5">
                    {g.title && <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: colors.textSecondary }}>{g.title}</p>}
                    {g.items.map((it) => {
                        const idx = items.findIndex((x) => x.id === it.id)
                        return (
                            <div key={it.id} className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: `${colors.border}26` }}>
                                <span style={{ color: '#f97316' }}>{kindIcon(it.kind, 18)}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[13px] font-bold truncate" style={{ color: colors.textPrimary }}>{it.title}</span>
                                    <span className="block text-[11px]" style={{ color: colors.textSecondary }}>{[it.kind === 'app' && it.platform ? `${APP_PLATFORM_LABEL[it.platform]} · v${it.version}` : '', formatDuration(it.duration_seconds), formatSize(it.size_bytes), it.external_url ? 'link' : '', it.kind === 'app' ? downloadsLabel(it.download_count) : ''].filter(Boolean).join(' · ') || ' '}</span>
                                </span>
                                {it.is_teaser ? (
                                    <span className="text-[10px] font-black rounded-full px-2 py-1" style={{ background: '#0ea5e922', color: '#0284c7' }}>Prévia da vitrine</span>
                                ) : (
                                    <button type="button" disabled={busy} onClick={() => run(() => setItemPreview(it.id, !it.is_preview))} className="text-[10px] font-black rounded-full px-2 py-1"
                                        style={{ background: it.is_preview ? '#22c55e22' : `${colors.border}55`, color: it.is_preview ? '#16a34a' : colors.textSecondary }}>{it.is_preview ? 'Grátis' : 'Pago'}</button>
                                )}
                                <button type="button" aria-label="Subir" disabled={busy || idx <= 0 || it.is_teaser || items[idx - 1].is_teaser} onClick={() => run(() => swapItems(it, items[idx - 1]))} className="p-1 disabled:opacity-30" style={{ color: colors.textSecondary }}><ArrowUp size={15} /></button>
                                <button type="button" aria-label="Descer" disabled={busy || idx >= items.length - 1 || it.is_teaser} onClick={() => run(() => swapItems(it, items[idx + 1]))} className="p-1 disabled:opacity-30" style={{ color: colors.textSecondary }}><ArrowDown size={15} /></button>
                                <button type="button" aria-label="Apagar" disabled={busy} onClick={() => { if (confirm(`Apagar "${it.title}"?`)) run(() => removeItem(it), 'Item apagado') }} className="p-1" style={{ color: '#ef4444' }}><Trash2 size={15} /></button>
                            </div>
                        )
                    })}
                </div>
            ))}
        </div>
    )
}
