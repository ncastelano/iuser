// app/(main)/compromissos/agendar/page.tsx
'use client'

import { useState } from 'react'
import { ArrowLeft, Store, User, Lock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import AnimatedBackground from '@/components/AnimatedBackground'
import CriarCompromissoLoja from './CriarCompromissoLoja'
import CriarCompromissoComAlguem from './CriarCompromissoComAlguem'
import CriarCompromissoPessoal from './CriarCompromissoPessoal'

type FlowType = 'none' | 'loja' | 'com-alguem' | 'pessoal'

export default function AgendarPage() {
    const router = useRouter()
    const [activeFlow, setActiveFlow] = useState<FlowType>('none')

    const handleBack = () => setActiveFlow('none')

    if (activeFlow === 'loja') return <CriarCompromissoLoja onBack={handleBack} />
    if (activeFlow === 'com-alguem') return <CriarCompromissoComAlguem onBack={handleBack} />
    if (activeFlow === 'pessoal') return <CriarCompromissoPessoal onBack={handleBack} />

    return (
        <main style={{ minHeight: '100vh', background: '#000', paddingBottom: 40, position: 'relative' }}>
            <AnimatedBackground />
            <div className="relative z-10">
                {/* HEADER – mesmo estilo do restante do app */}
                <div
                    style={{
                        background: 'linear-gradient(135deg, #000, #000)',
                        padding: '28px 24px',
                        color: '#fff',
                        borderBottomLeftRadius: 36,
                        borderBottomRightRadius: 36,
                        boxShadow: '0 10px 40px rgba(255,255,255,0.15)',
                    }}
                >
                    <button
                        onClick={() => router.back()}
                        style={{
                            background: 'rgba(255,255,255,0.15)',
                            border: 'none',
                            borderRadius: 14,
                            width: 42,
                            height: 42,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            backdropFilter: 'blur(10px)',
                        }}
                    >
                        <ArrowLeft size={22} color="#fff" />
                    </button>
                    <h1 style={{ fontSize: 34, fontWeight: 800, marginTop: 16, letterSpacing: '-0.5px' }}>
                        Novo compromisso
                    </h1>
                    <p style={{ opacity: 0.7, marginTop: 6, fontSize: 15, fontWeight: 500 }}>
                        Como será o compromisso?
                    </p>
                </div>

                {/* OPÇÕES DE TIPO */}
                <div style={{ padding: '20px 20px 0' }}>
                    <div style={{ marginTop: 24 }}>
                        <div
                            style={{
                                background: 'rgba(255,255,255,0.06)',
                                borderRadius: 28,
                                padding: 28,
                                border: '1px solid rgba(255,255,255,0.1)',
                                backdropFilter: 'blur(12px)',
                            }}
                        >
                            <h3
                                style={{
                                    fontWeight: 800,
                                    fontSize: 22,
                                    color: '#fff',
                                    marginBottom: 24,
                                    textAlign: 'center',
                                }}
                            >
                                Escolha o tipo
                            </h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {/* Agendar em loja */}
                                <button
                                    onClick={() => setActiveFlow('loja')}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 16,
                                        padding: 18,
                                        borderRadius: 20,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(255,255,255,0.06)',
                                        backdropFilter: 'blur(10px)',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        color: '#fff',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 48,
                                            height: 48,
                                            borderRadius: 14,
                                            background: 'linear-gradient(135deg, #f97316, #fbbf24)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Store size={24} color="#fff" />
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 700, fontSize: 17 }}>Agendar em loja</p>
                                        <p style={{ color: '#94a3b8', fontSize: 14 }}>
                                            Barbearia, clínica, restaurante...
                                        </p>
                                    </div>
                                </button>

                                {/* Convidar pessoa */}
                                <button
                                    onClick={() => setActiveFlow('com-alguem')}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 16,
                                        padding: 18,
                                        borderRadius: 20,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(255,255,255,0.06)',
                                        backdropFilter: 'blur(10px)',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        color: '#fff',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 48,
                                            height: 48,
                                            borderRadius: 14,
                                            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <User size={24} color="#fff" />
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 700, fontSize: 17 }}>Convidar pessoa</p>
                                        <p style={{ color: '#94a3b8', fontSize: 14 }}>
                                            Amigo, colega, profissional...
                                        </p>
                                    </div>
                                </button>

                                {/* Somente eu */}
                                <button
                                    onClick={() => setActiveFlow('pessoal')}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 16,
                                        padding: 18,
                                        borderRadius: 20,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: 'rgba(255,255,255,0.06)',
                                        backdropFilter: 'blur(10px)',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        color: '#fff',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 48,
                                            height: 48,
                                            borderRadius: 14,
                                            background: 'linear-gradient(135deg, #10b981, #34d399)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Lock size={24} color="#fff" />
                                    </div>
                                    <div>
                                        <p style={{ fontWeight: 700, fontSize: 17 }}>Somente eu</p>
                                        <p style={{ color: '#94a3b8', fontSize: 14 }}>
                                            Compromisso pessoal e privado
                                        </p>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    )
}