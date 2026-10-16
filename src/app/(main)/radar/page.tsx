// app/(main)/radar/page.tsx — /radar na interface 2.0 (a 3.0 é servida por /v3/radar com a mesma tela)
import RadarScreen from '@/versions/shared/screens/RadarScreen'

export default function RadarPage() {
    return <RadarScreen ui="v2" />
}
