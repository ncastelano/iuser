// components/ProfileDashboard/commissionCardTheme.ts — as cores do cartão de Comissões (a cor da GRADUAÇÃO da pessoa terminando no laranja/vermelho do iUser).
// Uma regra só: usada pelo cartão de saldo das Comissões e pelo cartão "Convidados iUser" do painel do perfil (22/11/2026: os dois iguais).
type Lvl = { border_colors?: string[] | null; border_color?: string | null } | null | undefined

const parse = (v: string) => {
    const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
    if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
    const h = v.replace('#', '')
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    return { r: parseInt(f.slice(0, 2), 16) || 0, g: parseInt(f.slice(2, 4), 16) || 0, b: parseInt(f.slice(4, 6), 16) || 0 }
}
const mixHex = (a: string, b: string, t: number) => {
    const A = parse(a); const B = parse(b)
    const c = (x: number, y: number) => Math.round(x + (y - x) * t)
    return `rgb(${c(A.r, B.r)}, ${c(A.g, B.g)}, ${c(A.b, B.b)})`
}
const lum = (v: string) => { const c = parse(v); return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 }

export function commissionCardTheme(lvl: Lvl) {
    // Níveis claros (prata, ouro...) ganham um pouco de sombra pra o texto branco continuar legível
    const tone = (c: string) => (lum(c) > 0.6 ? mixHex(c, '#000000', 0.38) : c)
    const c1 = tone(lvl?.border_colors?.[0] || lvl?.border_color || '#f97316')
    const c2 = tone(lvl?.border_colors?.[1] || lvl?.border_colors?.[0] || lvl?.border_color || '#f97316')
    const ORANGE = '#ea580c'
    const RED = '#b91c1c'
    return {
        background: `linear-gradient(110deg, ${mixHex(c1, '#000000', 0.3)} 0%, ${c1} 18%, ${c2} 40%, ${mixHex(c2, ORANGE, 0.55)} 60%, ${ORANGE} 82%, ${RED} 100%)`,
        text: '#ffffff',
        shadow: 'rgba(185, 28, 28, 0.32)',
        sheen: 'rgba(255,255,255,0.12)',
        sheenSoft: 'rgba(255,255,255,0.08)',
        buttonSolidBg: '#ffffff',
        buttonSolidText: '#b91c1c',
        buttonGhostBg: 'rgba(255,255,255,0.18)',
        buttonGhostBorder: 'rgba(255,255,255,0.5)',
        track: 'rgba(255,255,255,0.28)',
        fill: '#ffffff',
    }
}
