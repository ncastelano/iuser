// components/AnimatedBackground.tsx
'use client'

import { useEffect, useState } from 'react'

interface Particle {
  id: number
  top: string
  left: string
  size: number
  color: string
  blur: number
  delay: string
  duration: string
  xMove: number
  yMove: number
  rotate: number
}

export default function AnimatedBackground() {
  const [particles, setParticles] = useState<Particle[]>([])
  const [glowParticles, setGlowParticles] = useState<Particle[]>([])

  useEffect(() => {
    // Cores vibrantes
    const colors = [
      'rgba(249, 115, 22, 0.4)',   // laranja
      'rgba(239, 68, 68, 0.4)',    // vermelho
      'rgba(234, 179, 8, 0.4)',    // amarelo
      'rgba(236, 72, 153, 0.35)',  // rosa
      'rgba(168, 85, 247, 0.35)',  // roxo
      'rgba(34, 197, 94, 0.3)',    // verde claro
    ]

    // Partículas principais (maiores e mais chamativas)
    const newParticles: Particle[] = Array.from({ length: 16 }, (_, i) => ({
      id: i,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      size: Math.random() * 32 + 12, // entre 12px e 44px
      color: colors[Math.floor(Math.random() * colors.length)],
      blur: Math.random() * 12 + 4, // desfoque entre 4px e 16px
      delay: `${Math.random() * 8}s`,
      duration: `${Math.random() * 20 + 15}s`, // entre 15s e 35s
      xMove: (Math.random() - 0.5) * 300,
      yMove: (Math.random() - 0.5) * 300,
      rotate: Math.random() * 360,
    }))

    // Partículas de brilho (menores, com movimento mais rápido)
    const newGlowParticles: Particle[] = Array.from({ length: 24 }, (_, i) => ({
      id: i + 100,
      top: `${Math.random() * 100}%`,
      left: `${Math.random() * 100}%`,
      size: Math.random() * 8 + 2, // entre 2px e 10px
      color: `rgba(249, 115, 22, ${Math.random() * 0.6 + 0.3})`,
      blur: Math.random() * 5 + 1,
      delay: `${Math.random() * 5}s`,
      duration: `${Math.random() * 12 + 8}s`,
      xMove: (Math.random() - 0.5) * 150,
      yMove: (Math.random() - 0.5) * 150,
      rotate: Math.random() * 360,
    }))

    setParticles(newParticles)
    setGlowParticles(newGlowParticles)
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Glows de fundo com animação mais intensa */}
      <div className="absolute top-[-20%] right-[-10%] w-[80%] h-[80%] bg-gradient-to-br from-orange-500/30 via-red-500/20 to-yellow-500/20 blur-[180px] rounded-full animate-pulse-slow" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[70%] h-[70%] bg-gradient-to-tl from-red-600/25 via-orange-500/20 to-purple-500/15 blur-[160px] rounded-full animate-pulse-slower" style={{ animationDelay: '2s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50%] h-[50%] bg-gradient-to-r from-yellow-400/15 to-orange-500/15 blur-[200px] rounded-full animate-pulse-slow" style={{ animationDelay: '1s' }} />

      {/* Padrão de pontos mais denso */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.04)_1.5px,transparent_1.5px)] bg-[size:32px_32px]" />

      {/* Partículas grandes com blur e movimento orgânico */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full animate-float-smooth"
          style={{
            top: p.top,
            left: p.left,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            filter: `blur(${p.blur}px)`,
            animationDelay: p.delay,
            animationDuration: p.duration,
            '--x-move': `${p.xMove}px`,
            '--y-move': `${p.yMove}px`,
            '--rotate-start': `${p.rotate}deg`,
            '--rotate-end': `${p.rotate + 360}deg`,
          } as React.CSSProperties}
        />
      ))}

      {/* Partículas de brilho (menores e mais nítidas) */}
      {glowParticles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full animate-float-twinkle"
          style={{
            top: p.top,
            left: p.left,
            width: `${p.size}px`,
            height: `${p.size}px`,
            backgroundColor: p.color,
            filter: `blur(${p.blur}px)`,
            animationDelay: p.delay,
            animationDuration: p.duration,
            '--x-move': `${p.xMove}px`,
            '--y-move': `${p.yMove}px`,
          } as React.CSSProperties}
        />
      ))}

      <style jsx global>{`
        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.4;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.05);
          }
        }
        @keyframes pulse-slower {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.08);
          }
        }
        @keyframes float-smooth {
          0% {
            transform: translate(0, 0) rotate(var(--rotate-start, 0deg));
            opacity: 0.2;
          }
          25% {
            transform: translate(calc(var(--x-move, 30px) * 0.4), calc(var(--y-move, -30px) * 0.4)) rotate(calc(var(--rotate-start, 0deg) + 90deg));
            opacity: 0.6;
          }
          50% {
            transform: translate(var(--x-move, 30px), var(--y-move, -30px)) rotate(var(--rotate-end, 360deg));
            opacity: 0.8;
          }
          75% {
            transform: translate(calc(var(--x-move, 30px) * 0.6), calc(var(--y-move, -30px) * 0.6)) rotate(calc(var(--rotate-end, 360deg) + 90deg));
            opacity: 0.5;
          }
          100% {
            transform: translate(0, 0) rotate(var(--rotate-start, 0deg));
            opacity: 0.2;
          }
        }
        @keyframes float-twinkle {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 0;
          }
          25% {
            transform: translate(calc(var(--x-move, 20px) * 0.3), calc(var(--y-move, -20px) * 0.3)) scale(1.3);
            opacity: 0.7;
          }
          50% {
            transform: translate(calc(var(--x-move, 20px) * 0.8), calc(var(--y-move, -20px) * 0.8)) scale(0.8);
            opacity: 0.4;
          }
          75% {
            transform: translate(calc(var(--x-move, 20px) * 0.4), calc(var(--y-move, -20px) * 0.4)) scale(1.2);
            opacity: 0.6;
          }
          100% {
            transform: translate(0, 0) scale(1);
            opacity: 0;
          }
        }
        .animate-pulse-slow {
          animation: pulse-slow 8s ease-in-out infinite;
        }
        .animate-pulse-slower {
          animation: pulse-slower 12s ease-in-out infinite;
        }
        .animate-float-smooth {
          animation: float-smooth cubic-bezier(0.45, 0.05, 0.2, 0.99) infinite;
          will-change: transform, opacity;
        }
        .animate-float-twinkle {
          animation: float-twinkle ease-in-out infinite;
          will-change: transform, opacity;
        }
      `}</style>
    </div>
  )
}