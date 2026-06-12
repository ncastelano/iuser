'use client'

import { useEffect, useRef, useCallback } from 'react'

type BgMode = 'animated' | 'black' | 'white' | 'custom'

interface AnimatedBackgroundProps {
  bgMode?: BgMode
  customBgUrl?: string | null
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  baseOpacity: number
  phase: number
  speed: number
  color: [number, number, number]
}

const PALETTE: [number, number, number][] = [
  [255, 77, 46],
  [255, 215, 0],
  [0, 200, 150],
  [0, 180, 255],
  [180, 100, 255],
  [255, 50, 120],
  [255, 140, 0],
]

export default function AnimatedBackgroundiUser({
  bgMode = 'animated',
  customBgUrl = null,
}: AnimatedBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const animFrameRef = useRef<number | null>(null)

  // Mouse move handler – apenas atualiza a posição do mouse
  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  // Lógica de animação só é executada quando bgMode === 'animated'
  useEffect(() => {
    if (bgMode !== 'animated') {
      // Se não for animado, não faz nada (o canvas some)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', resize)
    resize()

    const PARTICLE_COUNT = 80
    const particles: Particle[] = []

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        radius: Math.random() * 20 + 15,
        baseOpacity: Math.random() * 0.3 + 0.1,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.008 + 0.002,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      })
    }

    window.addEventListener('mousemove', handleMouseMove)

    const MOUSE_RADIUS = 100
    const REPULSE_STRENGTH = 1.2
    const RETURN_SPEED = 0.995

    const animate = () => {
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const mouse = mouseRef.current

      for (const p of particles) {
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < MOUSE_RADIUS) {
          const angle = Math.atan2(dy, dx)
          const force = ((MOUSE_RADIUS - dist) / MOUSE_RADIUS) * REPULSE_STRENGTH
          p.vx += Math.cos(angle) * force * 0.03
          p.vy += Math.sin(angle) * force * 0.03
        }

        p.phase += p.speed
        const fade = Math.sin(p.phase) * 0.2 + 0.8
        const currentOpacity = p.baseOpacity * fade

        const [r, g, b] = p.color

        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius)
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${currentOpacity * 1.5})`)
        gradient.addColorStop(0.1, `rgba(${r}, ${g}, ${b}, ${currentOpacity * 1.2})`)
        gradient.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${currentOpacity * 0.8})`)
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${currentOpacity * 0.4})`)
        gradient.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, ${currentOpacity * 0.1})`)
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()

        p.x += p.vx
        p.y += p.vy

        p.vx *= RETURN_SPEED
        p.vy *= RETURN_SPEED

        const minSpeed = 0.05
        const currentSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (currentSpeed < minSpeed) {
          const angle = Math.atan2(p.vy, p.vx)
          p.vx = Math.cos(angle) * minSpeed
          p.vy = Math.sin(angle) * minSpeed
        }

        if (p.x < -p.radius) p.x = canvas.width + p.radius
        if (p.x > canvas.width + p.radius) p.x = -p.radius
        if (p.y < -p.radius) p.y = canvas.height + p.radius
        if (p.y > canvas.height + p.radius) p.y = -p.radius
      }

      animFrameRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [bgMode, handleMouseMove]) // Dependência em bgMode para reiniciar ao trocar para 'animated'

  // Renderização condicional
  if (bgMode === 'black') {
    return (
      <div
        className="fixed inset-0 z-0"
        style={{ background: '#000000' }}
      />
    )
  }



  if (bgMode === 'custom' && customBgUrl) {
    return (
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${customBgUrl})` }}
      />
    )
  }

  // Fallback: se for 'custom' mas sem URL, mostra preto (ou poderia ser um placeholder)
  if (bgMode === 'custom' && !customBgUrl) {
    return (
      <div
        className="fixed inset-0 z-0"
        style={{ background: '#000000' }}
      />
    )
  }

  // bgMode === 'animated'
  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ background: '#000' }}
    />
  )
}