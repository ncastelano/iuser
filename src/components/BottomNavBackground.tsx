// src/components/BottomNavBackground.tsx
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

export default function BottomNavBackground() {
    const [isMounted, setIsMounted] = useState(false)
    const [bubbles, setBubbles] = useState<Bubble[]>([])
    const [pulsingBalls, setPulsingBalls] = useState<PulsingBall[]>([])

    useEffect(() => {
        setIsMounted(true)
    }, [])

    const createBubble = useCallback(() => {
        const newBubble: Bubble = {
            id: Date.now() + Math.random(),
            left: `${Math.random() * 100}%`,
            startSize: Math.random() * 20 + 10,
            duration: Math.random() * 4 + 4,
            delay: Math.random() * 2,
        }
        setBubbles(prev => [...prev, newBubble])
        setTimeout(() => {
            setBubbles(prev => prev.filter(b => b.id !== newBubble.id))
        }, (newBubble.duration + newBubble.delay) * 1000)
    }, [])

    const createPulsingBall = useCallback(() => {
        const colors = [
            'rgba(249, 115, 22, 0.06)',
            'rgba(239, 68, 68, 0.04)',
            'rgba(234, 179, 8, 0.03)',
            'rgba(249, 115, 22, 0.03)',
        ]
        const newBall: PulsingBall = {
            id: Date.now() + Math.random(),
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            size: Math.random() * 40 + 20,
            duration: Math.random() * 4 + 4,
            delay: Math.random() * 6,
            color: colors[Math.floor(Math.random() * colors.length)]
        }
        setPulsingBalls(prev => [...prev, newBall])
        setTimeout(() => {
            setPulsingBalls(prev => prev.filter(b => b.id !== newBall.id))
        }, (newBall.duration + newBall.delay) * 1000)
    }, [])

    useEffect(() => {
        if (!isMounted) return
        const bubbleInterval = setInterval(() => {
            const bubbleCount = Math.floor(Math.random() * 1) + 1
            for (let i = 0; i < bubbleCount; i++) {
                setTimeout(() => createBubble(), i * 200)
            }
        }, 2000)
        const pulseInterval = setInterval(() => {
            const ballCount = Math.floor(Math.random() * 1) + 1
            for (let i = 0; i < ballCount; i++) {
                setTimeout(() => createPulsingBall(), i * 300)
            }
        }, 6000)
        return () => {
            clearInterval(bubbleInterval)
            clearInterval(pulseInterval)
        }
    }, [createBubble, createPulsingBall, isMounted])

    if (!isMounted) {
        return <div className="absolute inset-0 pointer-events-none overflow-hidden" />
    }

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {pulsingBalls.map((ball) => (
                <div key={ball.id} className="absolute rounded-full"
                    style={{
                        left: ball.left, top: ball.top, width: `${ball.size}px`, height: `${ball.size}px`,
                        backgroundColor: ball.color, transform: 'translate(-50%, -50%)',
                        animation: `pulseSoftSmall ${ball.duration}s ease-in-out ${ball.delay}s forwards`,
                    }} />
            ))}
            {bubbles.map((bubble) => (
                <div key={bubble.id} className="absolute rounded-full will-change-transform"
                    style={{
                        left: bubble.left, top: '-10px', width: `${bubble.startSize}px`, height: `${bubble.startSize}px`,
                        background: `radial-gradient(circle at 30% 30%, rgba(249, 115, 22, 0.2), rgba(239, 68, 68, 0.1))`,
                        boxShadow: `0 0 ${bubble.startSize * 0.2}px rgba(249, 115, 22, 0.08)`,
                        animation: `floatDownSmooth ${bubble.duration}s cubic-bezier(0.4, 0, 0.2, 1) ${bubble.delay}s forwards`,
                    }} />
            ))}
            {bubbles.map((bubble) => (
                <div key={`small-${bubble.id}`} className="absolute rounded-full will-change-transform"
                    style={{
                        left: `calc(${bubble.left} + ${(bubble.id % 10) - 5}px)`, top: '-10px',
                        width: `${bubble.startSize * 0.4}px`, height: `${bubble.startSize * 0.4}px`,
                        background: `radial-gradient(circle at 30% 30%, rgba(239, 68, 68, 0.15), rgba(249, 115, 22, 0.06))`,
                        filter: 'blur(1px)',
                        animation: `floatDownSmooth ${bubble.duration * 1.2}s cubic-bezier(0.4, 0, 0.2, 1) ${bubble.delay * 1.1}s forwards`,
                    }} />
            ))}
            <style jsx global>{`
        @keyframes floatDownSmooth {
          0% { top: -10px; opacity: 0; }
          10% { opacity: 0.4; }
          90% { opacity: 0.2; }
          100% { top: 120%; opacity: 0; width: 0px; height: 0px; }
        }
        @keyframes pulseSoftSmall {
          0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; }
          25% { opacity: 0.08; }
          50% { transform: translate(-50%, -50%) scale(1); opacity: 0.06; }
          75% { opacity: 0.04; }
          100% { transform: translate(-50%, -50%) scale(1.2); opacity: 0; }
        }
      `}</style>
        </div>
    )
}