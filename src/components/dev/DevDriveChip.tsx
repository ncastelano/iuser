// src/components/dev/DevDriveChip.tsx — o painelzinho do MOTORISTA DE TESTE (só LOCAL): liga/desliga o carro que anda sozinho e escolhe a velocidade.
'use client'

import { Car } from 'lucide-react'
import { setDevDriveEnabled, setDevDriveSpeed } from '@/lib/devDrive'

export default function DevDriveChip({ on, speed, onChange }: { on: boolean; speed: number; onChange: (on: boolean, speed: number) => void }) {
    const btn = 'px-2 py-1 rounded-full text-[11px] font-black'
    return (
        <div className="inline-flex items-center gap-1 p-1 rounded-full shadow-xl text-[11px] font-black" style={{ background: 'rgba(17,17,17,0.82)', color: '#fff' }} data-dev-drive>
            <button
                onClick={() => { setDevDriveEnabled(!on); onChange(!on, speed) }}
                className={`${btn} inline-flex items-center gap-1`}
                style={{ background: on ? '#22c55e' : 'rgba(255,255,255,0.18)' }}
                title="Simulação do percurso (só no ambiente de teste)"
            >
                <Car size={12} /> {on ? 'Simulando' : 'Simulação desligada'}
            </button>
            {on && ([1, 3, 6, 10, 20] as const).map((v) => (
                <button key={v} onClick={() => { setDevDriveSpeed(v); onChange(on, v) }} className={btn} style={{ background: speed === v ? '#f97316' : 'transparent' }}>{v}×</button>
            ))}
        </div>
    )
}
