// components/vitrine/LoadingSpinner.tsx

import AnimatedBackground from '@/components/AnimatedBackground'
import { Sparkles } from 'lucide-react'

type LoadingSpinnerProps = {
    message?: string
    showDots?: boolean
}

export function LoadingSpinner({ message = 'Carregando...', showDots = true }: LoadingSpinnerProps) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-red-50 to-yellow-50 flex items-center justify-center relative overflow-hidden">
            <AnimatedBackground />

            <div className="relative z-10 flex flex-col items-center gap-8">
                {/* Container principal com efeito de flutuação */}
                <div className="relative animate-[float_3s_ease-in-out_infinite]">
                    {/* Anel orbital externo */}
                    <div className="absolute inset-0 w-28 h-28 -m-4 rounded-full border-2 border-dashed border-orange-300/30 animate-[spin_8s_linear_infinite]" />

                    {/* Anel orbital médio */}
                    <div className="absolute inset-0 w-24 h-24 -m-2 rounded-full border border-orange-400/20 animate-[spin_6s_linear_infinite_reverse]" />

                    {/* Partículas orbitando */}
                    <div className="absolute inset-0 w-32 h-32 -m-6 animate-[spin_4s_linear_infinite]">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-orange-500 rounded-full shadow-lg shadow-orange-500/50" />
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-red-500 rounded-full shadow-lg shadow-red-500/50" />
                    </div>

                    {/* Partículas em órbita reversa */}
                    <div className="absolute inset-0 w-28 h-28 -m-4 animate-[spin_5s_linear_infinite_reverse]">
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-yellow-500 rounded-full shadow-lg shadow-yellow-500/50" />
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-orange-600 rounded-full shadow-lg shadow-orange-600/50" />
                    </div>

                    {/* Container do ícone com gradiente */}
                    <div className="relative">
                        {/* Efeito de brilho atrás do ícone */}
                        <div className="absolute inset-0 w-20 h-20 bg-gradient-to-r from-orange-500 to-red-500 rounded-full blur-xl opacity-50 animate-[pulse_2s_ease-in-out_infinite]" />

                        {/* Ícone principal */}
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-400 via-orange-500 to-red-600 flex items-center justify-center relative z-10 shadow-[0_0_30px_rgba(251,146,60,0.4),0_0_60px_rgba(239,68,68,0.2)] ring-2 ring-white/80 ring-offset-2 ring-offset-orange-50">
                            <img
                                src="/logo.png"
                                alt="iUser"
                                className="h-10 w-10 object-contain rounded-full drop-shadow-lg"
                            />
                        </div>

                        {/* Brilho de destaque no ícone */}
                        <div className="absolute -top-1 -left-1 w-4 h-4 bg-white rounded-full blur-[2px] opacity-60 z-20" />
                    </div>
                </div>


            </div>

            <style jsx>{`
                @keyframes float {
                    0%, 100% {
                        transform: translateY(0px);
                    }
                    50% {
                        transform: translateY(-10px);
                    }
                }
                
                @keyframes spin {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }
                
                @keyframes spin_reverse {
                    from {
                        transform: rotate(360deg);
                    }
                    to {
                        transform: rotate(0deg);
                    }
                }
                
                @keyframes slide {
                    0%, 100% {
                        transform: translateX(-100%);
                    }
                    50% {
                        transform: translateX(200%);
                    }
                }
                
                @keyframes pulse {
                    0%, 100% {
                        opacity: 0.5;
                        transform: scale(1);
                    }
                    50% {
                        opacity: 0.8;
                        transform: scale(1.1);
                    }
                }
            `}</style>
        </div>
    )
}