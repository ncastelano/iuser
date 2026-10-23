// Imagem do cartão de compartilhamento de um veículo/motorista (og:image, 1200x630) — é ela que o WhatsApp,
// Telegram e iMessage mostram quando o motorista manda o link iuser.com.br/<vehicleSlug>.
// Só dados públicos (ver lib/vehicleShareCard.ts). O servidor desenha a imagem; a foto do carro e a do
// motorista passam pelo sharp (tamanho fixo, JPEG) pra o desenho nunca falhar por formato ou peso.
import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { brlShort, loadVehicleShareData } from '@/lib/vehicleShareCard'

export const runtime = 'nodejs'

const W = 1200
const H = 630
const ORANGE = '#f97316'
const RED = '#dc2626'
const PHOTO_W = 500

// A fonte do desenho é uma só (peso normal): o "negrito" é um contorno fino da mesma cor.
const bold = (color: string, size = 1.4) => ({ color, WebkitTextStroke: `${size}px ${color}` })

async function toDataUri(url: string | null, w: number, h: number): Promise<string | null> {
    if (!url) return null
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
        if (!res.ok) return null
        const buf = await sharp(Buffer.from(await res.arrayBuffer()))
            .rotate()
            .resize(w, h, { fit: 'cover', position: 'centre' })
            .jpeg({ quality: 86 })
            .toBuffer()
        return `data:image/jpeg;base64,${buf.toString('base64')}`
    } catch {
        return null
    }
}

async function logoDataUri(): Promise<string | null> {
    try {
        const buf = await readFile(path.join(process.cwd(), 'public', 'android-chrome-192x192.png'))
        return `data:image/png;base64,${buf.toString('base64')}`
    } catch {
        return null
    }
}

const Star = ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24"><path fill={color} d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" /></svg>
)
const Route = ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24"><path fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="M6 19a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18 10a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM8.5 16.5H15a3 3 0 000-6h-6a3 3 0 010-6h6.5" /></svg>
)
const Calendar = ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24"><path fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1zM4 10h16M8 3v4M16 3v4" /></svg>
)
const Arrow = ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24"><path fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
)
const CarGlyph = ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24"><path fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M5 17H3v-4l2-5h14l2 5v4h-2M5 17a2 2 0 104 0M15 17a2 2 0 104 0M9 17h6M3 13h18" /></svg>
)

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const d = await loadVehicleShareData(slug).catch(() => null)
    const [logo, car, avatar] = await Promise.all([
        logoDataUri(),
        toDataUri(d?.carPhotoUrl ?? null, PHOTO_W, H),
        toDataUri(d?.avatarUrl ?? null, 220, 220),
    ])

    const name = d ? (d.driverName.length > 24 ? `${d.driverName.slice(0, 23)}…` : d.driverName) : 'Motorista iUser'
    const vehicleLine = d ? `${d.model}${d.color ? ` · ${d.color}` : ''}` : 'Chame uma corrida'
    const detailLine = d
        ? [d.kindLabel, d.capacity ? `${d.capacity} ${d.capacity === 1 ? 'passageiro' : 'passageiros'}` : null, ...d.services.slice(0, 2)].filter(Boolean).join('  ·  ')
        : 'pelo iUser'
    const hasRating = !!d && d.rating != null && d.ratingCount > 0

    const stats = [
        {
            icon: <Star size={30} color={ORANGE} />,
            value: hasRating ? d!.rating!.toFixed(1).replace('.', ',') : 'Novo',
            label: hasRating ? `${d!.ratingCount} ${d!.ratingCount === 1 ? 'avaliação' : 'avaliações'}` : 'sem avaliações',
        },
        { icon: <Route size={30} color={ORANGE} />, value: String(d?.rides ?? 0), label: (d?.rides ?? 0) === 1 ? 'corrida' : 'corridas' },
        { icon: <Calendar size={30} color={ORANGE} />, value: d?.memberSince || '—', label: 'no iUser' },
    ]

    return new ImageResponse(
        (
            <div style={{ width: W, height: H, display: 'flex', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #3b1d0a 100%)', color: '#fff' }}>
                {/* Foto do veículo */}
                <div style={{ width: PHOTO_W, height: H, display: 'flex', position: 'relative', background: `linear-gradient(135deg, ${ORANGE}, ${RED})`, alignItems: 'center', justifyContent: 'center' }}>
                    {car
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={car} width={PHOTO_W} height={H} style={{ width: PHOTO_W, height: H, objectFit: 'cover' }} alt="" />
                        : <CarGlyph size={260} color="rgba(255,255,255,0.9)" />}
                    <div style={{ position: 'absolute', left: 0, bottom: 0, width: PHOTO_W, height: 170, display: 'flex', background: 'linear-gradient(0deg, rgba(15,23,42,0.85), rgba(15,23,42,0))' }} />
                    {d?.plate && (
                        <div style={{ position: 'absolute', left: 32, bottom: 32, display: 'flex', alignItems: 'center', padding: '8px 22px', borderRadius: 12, background: '#fff', border: '3px solid #0f172a', fontSize: 34, letterSpacing: 4, ...bold('#0f172a', 1) }}>
                            {d.plate}
                        </div>
                    )}
                </div>

                {/* Conteúdo */}
                <div style={{ flex: 1, height: H, display: 'flex', flexDirection: 'column', padding: '40px 52px 36px 52px' }}>
                    {/* Selo */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 18px', borderRadius: 999, background: 'rgba(249,115,22,0.16)', border: `2px solid ${ORANGE}`, fontSize: 22, letterSpacing: 3, ...bold(ORANGE, 0.6) }}>
                            MOTORISTA iUSER
                        </div>
                    </div>

                    {/* Motorista */}
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: 24 }}>
                        <div style={{ width: 100, height: 100, borderRadius: 50, display: 'flex', border: `4px solid ${ORANGE}`, background: `linear-gradient(135deg, ${ORANGE}, ${RED})`, alignItems: 'center', justifyContent: 'center', fontSize: 44, ...bold('#fff', 1) }}>
                            {avatar
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={avatar} width={92} height={92} style={{ width: 92, height: 92, objectFit: 'cover', borderRadius: 46 }} alt="" />
                                : name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 22 }}>
                            <div style={{ fontSize: 50, lineHeight: 1.05, ...bold('#fff', 1.6) }}>{name}</div>
                            <div style={{ fontSize: 26, marginTop: 4, color: '#94a3b8' }}>{d?.driverSlug ? `@${d.driverSlug}` : 'iuser.com.br'}</div>
                        </div>
                    </div>

                    {/* Veículo */}
                    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22 }}>
                        <div style={{ fontSize: 40, lineHeight: 1.1, ...bold('#fff', 1.2) }}>{vehicleLine}</div>
                        <div style={{ fontSize: 24, marginTop: 6, color: '#cbd5e1' }}>{detailLine}</div>
                    </div>

                    {/* Números */}
                    <div style={{ display: 'flex', marginTop: 28 }}>
                        {stats.map((s, i) => (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 16px', marginLeft: i ? 14 : 0, borderRadius: 22, background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.14)' }}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {s.icon}
                                    <div style={{ marginLeft: 10, fontSize: 36, lineHeight: 1, whiteSpace: 'nowrap', ...bold('#fff', 1.2) }}>{s.value}</div>
                                </div>
                                <div style={{ fontSize: 20, marginTop: 10, whiteSpace: 'nowrap', color: '#94a3b8' }}>{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Chamar */}
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: 'auto' }}>
                        <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: 84, borderRadius: 42, background: `linear-gradient(90deg, ${ORANGE}, ${RED})`, fontSize: 34, ...bold('#fff', 1.2) }}>
                            Chamar para corrida
                            <div style={{ display: 'flex', marginLeft: 14 }}><Arrow size={36} color="#fff" /></div>
                        </div>
                        {d?.fromPrice != null && (
                            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 20, alignItems: 'flex-start' }}>
                                <div style={{ fontSize: 20, color: '#94a3b8' }}>a partir de</div>
                                <div style={{ fontSize: 38, lineHeight: 1, ...bold('#fff', 1.3) }}>{brlShort(d.fromPrice)}</div>
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: 14 }}>
                        {logo && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logo} width={30} height={30} style={{ width: 30, height: 30, borderRadius: 15 }} alt="" />
                        )}
                        <div style={{ marginLeft: 10, fontSize: 22, color: '#94a3b8' }}>{`iuser.com.br/${d?.slug || ''}`}</div>
                    </div>
                </div>
            </div>
        ),
        {
            width: W,
            height: H,
            headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400' },
        },
    )
}
