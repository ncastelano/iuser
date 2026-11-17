// app/(main)/(shell)/veiculo/[vehicleSlug]/page.tsx
//
// O endereço público de um veículo (iuser.com.br/<vehicleSlug>, que o proxy reescreve para cá) agora LEVA AO PERFIL do motorista (17/11/2026,
// decisão do dono): a página própria do veículo saiu — o perfil do tipo Motorista já mostra o veículo, o mapa, quanto custa e as avaliações.
// Links antigos e compartilhados continuam funcionando; a prévia do link (layout.tsx) segue a mesma.
import { redirect } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase/admin'

export default async function VeiculoPage({ params }: { params: Promise<{ vehicleSlug: string }> }) {
    const { vehicleSlug } = await params
    const { data: v } = await supabaseAdmin.from('driver_vehicles').select('driver_id').ilike('vehicle_slug', vehicleSlug).maybeSingle()
    if (v?.driver_id) {
        const { data: p } = await supabaseAdmin.from('profiles').select('profileSlug').eq('id', v.driver_id).maybeSingle()
        if (p?.profileSlug) redirect(`/${p.profileSlug}`)
    }
    redirect('/')
}
