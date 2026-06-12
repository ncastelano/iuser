'use client'

import { useEffect, useRef, useCallback } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  baseOpacity: number
  phase: number
  speed: number
}

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const particlesRef = useRef<Particle[]>([])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    mouseRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  useEffect(() => {
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

    const PARTICLE_COUNT = 120
    const particles: Particle[] = []

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: Math.random() * 3 + 1.5,
        baseOpacity: Math.random() * 0.6 + 0.2,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.015 + 0.005,
      })
    }
    particlesRef.current = particles

    window.addEventListener('mousemove', handleMouseMove)

    const MOUSE_RADIUS = 120
    const REPULSE_STRENGTH = 1.8
    const RETURN_SPEED = 0.98

    let animationId: number

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const mouse = mouseRef.current

      for (const p of particles) {
        // Interação com o mouse
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < MOUSE_RADIUS) {
          const angle = Math.atan2(dy, dx)
          const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS * REPULSE_STRENGTH
          p.vx += Math.cos(angle) * force * 0.15
          p.vy += Math.sin(angle) * force * 0.15
        }

        // Fade
        p.phase += p.speed
        const fade = Math.sin(p.phase) * 0.5 + 0.5
        const currentOpacity = p.baseOpacity * fade

        // Desenho
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${currentOpacity})`
        ctx.shadowBlur = 25
        ctx.shadowColor = `rgba(255, 255, 255, ${currentOpacity * 0.7})`
        ctx.fill()
        ctx.shadowBlur = 0

        // Atualiza posição
        p.x += p.vx
        p.y += p.vy

        // Amortecimento (volta ao normal gradualmente)
        p.vx *= RETURN_SPEED
        p.vy *= RETURN_SPEED

        // Mantém uma velocidade mínima para nunca ficarem paradas
        const minSpeed = 0.2
        const currentSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (currentSpeed < minSpeed) {
          const angle = Math.atan2(p.vy, p.vx)
          p.vx = Math.cos(angle) * minSpeed
          p.vy = Math.sin(angle) * minSpeed
        }

        // Reposicionamento nas bordas
        if (p.x < -p.radius) p.x = canvas.width + p.radius
        if (p.x > canvas.width + p.radius) p.x = -p.radius
        if (p.y < -p.radius) p.y = canvas.height + p.radius
        if (p.y > canvas.height + p.radius) p.y = -p.radius
      }

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [handleMouseMove])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ background: '#000' }}
    />
  )
}