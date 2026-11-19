// app/(main)/(shell)/ganhos/page.tsx — Ganhos do motorista foi MESCLADO na página de Entregas (19/11/2026). O endereço antigo leva para lá.
import { redirect } from 'next/navigation'

export default function GanhosPage() {
    redirect('/entregas#ganhos')
}
