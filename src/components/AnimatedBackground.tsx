'use client'

import { useEffect, useState, useCallback } from 'react'

interface Bubble {
  id: number
  left: string
  startSize: number
  duration: number
  delay: number
}

interface PulsingBall {
  id: number
  left: string
  top: string
  size: number
  duration: number
  delay: number
  color: string
}

export default function AnimatedBackground() {
  const [isMounted, setIsMounted] = useState(false)
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [pulsingBalls, setPulsingBalls] = useState<PulsingBall[]>([])

  // Garantir que a animação só execute no cliente
  useEffect(() => {
    setIsMounted(true)
  }, [])

  const createBubble = useCallback(() => {
    const newBubble: Bubble = {
      id: Date.now() + Math.random(),
      left: `${Math.random() * 100}%`,
      startSize: Math.random() * 80 + 40,
      duration: Math.random() * 8 + 8,
      delay: Math.random() * 3,
    }
    setBubbles(prev => [...prev, newBubble])

    setTimeout(() => {
      setBubbles(prev => prev.filter(b => b.id !== newBubble.id))
    }, (newBubble.duration + newBubble.delay) * 1000)
  }, [])

  const createPulsingBall = useCallback(() => {
    const colors = [
      'rgba(249, 115, 22, 0.08)',
      'rgba(239, 68, 68, 0.06)',
      'rgba(234, 179, 8, 0.05)',
      'rgba(249, 115, 22, 0.04)',
    ]

    const newBall: PulsingBall = {
      id: Date.now() + Math.random(),
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: Math.random() * 120 + 80,
      duration: Math.random() * 6 + 6,
      delay: Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)]
    }
    setPulsingBalls(prev => [...prev, newBall])

    setTimeout(() => {
      setPulsingBalls(prev => prev.filter(b => b.id !== newBall.id))
    }, (newBall.duration + newBall.delay) * 1000)
  }, [])

  useEffect(() => {
    // Só iniciar as animações após montagem no cliente
    if (!isMounted) return

    const bubbleInterval = setInterval(() => {
      const bubbleCount = Math.floor(Math.random() * 2) + 1
      for (let i = 0; i < bubbleCount; i++) {
        setTimeout(() => createBubble(), i * 300)
      }
    }, 1200)

    const pulseInterval = setInterval(() => {
      const ballCount = Math.floor(Math.random() * 2) + 1
      for (let i = 0; i < ballCount; i++) {
        setTimeout(() => createPulsingBall(), i * 500)
      }
    }, 5000)

    return () => {
      clearInterval(bubbleInterval)
      clearInterval(pulseInterval)
    }
  }, [createBubble, createPulsingBall, isMounted])

  // Prevenir renderização durante SSR
  if (!isMounted) {
    return <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 bg-white" />
  }

  // Gerar bolhas ambiente apenas no cliente com valores fixos
  const ambientBubbles = [...Array(8)].map((_, i) => {
    // Usar valores baseados no índice para consistência
    const seed = i * 12345
    const duration = 15 + (seed % 15) // 15-30 segundos
    const delay = (seed % 20)
    const startSize = 25 + (seed % 50) // 25-75px
    const left = (seed % 100)

    return {
      key: `ambient-${i}`,
      duration,
      delay,
      startSize,
      left
    }
  })

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 bg-white">

      {/* Bolas pulsantes (background) - MAIS SUAVES */}
      {pulsingBalls.map((ball) => (
        <div
          key={ball.id}
          className="absolute rounded-full"
          style={{
            left: ball.left,
            top: ball.top,
            width: `${ball.size}px`,
            height: `${ball.size}px`,
            backgroundColor: ball.color,
            transform: 'translate(-50%, -50%)',
            animation: `pulseSoft ${ball.duration}s ease-in-out ${ball.delay}s forwards`,
          }}
        />
      ))}

      {/* Bolhas principais que sobem - SEM OSCILAÇÃO DE OPACIDADE */}
      {bubbles.map((bubble) => (
        <div
          key={bubble.id}
          className="absolute rounded-full will-change-transform"
          style={{
            left: bubble.left,
            bottom: '-30px',
            width: `${bubble.startSize}px`,
            height: `${bubble.startSize}px`,
            background: `radial-gradient(circle at 30% 30%, rgba(249, 115, 22, 0.3), rgba(239, 68, 68, 0.15))`,
            boxShadow: `0 0 ${bubble.startSize * 0.3}px rgba(249, 115, 22, 0.1)`,
            animation: `floatUpSmooth ${bubble.duration}s cubic-bezier(0.4, 0, 0.2, 1) ${bubble.delay}s forwards`,
          }}
        />
      ))}

      {/* Bolhas secundárias - AINDA MAIS SUAVES */}
      {bubbles.map((bubble) => (
        <div
          key={`small-${bubble.id}`}
          className="absolute rounded-full will-change-transform"
          style={{
            left: `calc(${bubble.left} + ${(bubble.id % 20) - 10}px)`, // Usar ID para consistência
            bottom: '-30px',
            width: `${bubble.startSize * 0.5}px`,
            height: `${bubble.startSize * 0.5}px`,
            background: `radial-gradient(circle at 30% 30%, rgba(239, 68, 68, 0.2), rgba(249, 115, 22, 0.08))`,
            filter: 'blur(2px)',
            animation: `floatUpSmooth ${bubble.duration * 1.1}s cubic-bezier(0.4, 0, 0.2, 1) ${bubble.delay * 1.05}s forwards`,
          }}
        />
      ))}

      {/* Bolhas ambiente - OPACIDADE CONSTANTE (agora com valores consistentes) */}
      <div className="absolute inset-0">
        {ambientBubbles.map((bubble) => (
          <div
            key={bubble.key}
            className="absolute rounded-full will-change-transform"
            style={{
              left: `${bubble.left}%`,
              bottom: '-30px',
              width: `${bubble.startSize}px`,
              height: `${bubble.startSize}px`,
              background: `radial-gradient(circle at 30% 30%, rgba(249, 115, 22, 0.08), rgba(239, 68, 68, 0.04))`,
              animation: `floatUpAmbientSmooth ${bubble.duration}s linear ${bubble.delay}s infinite`,
            }}
          />
        ))}
      </div>

      <style jsx global>{`
        @keyframes floatUpSmooth {
          0% {
            bottom: -30px;
            opacity: 0;
          }
          10% {
            opacity: 0.5;
          }
          90% {
            opacity: 0.3;
          }
          100% {
            bottom: 110%;
            opacity: 0;
            width: 0px;
            height: 0px;
          }
        }

        @keyframes floatUpAmbientSmooth {
          0% {
            bottom: -30px;
            opacity: 0;
          }
          10% {
            opacity: 0.15;
          }
          90% {
            opacity: 0.08;
          }
          100% {
            bottom: 110%;
            opacity: 0;
            width: 0px;
            height: 0px;
          }
        }

        @keyframes pulseSoft {
          0% {
            transform: translate(-50%, -50%) scale(0.8);
            opacity: 0;
          }
          25% {
            opacity: 0.12;
          }
          50% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.1;
          }
          75% {
            opacity: 0.06;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.3);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}