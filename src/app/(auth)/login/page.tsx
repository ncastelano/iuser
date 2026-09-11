// app/(auth)/login/page.tsx
'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LoginAndRegister from '@/app/(main)/LoginAndRegister'
import { Spinner } from '@/components/Spinner'

export const dynamic = 'force-dynamic'

// Página standalone de /login: usa o mesmo componente do modal de login
// embutido no homepage (LoginAndRegister.tsx), só trocando o que acontece
// depois de logar - aqui navega pra rota de ?redirect= (usada por várias
// páginas que mandam pra cá exigindo login), lá ele fecha o modal.
function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleLoginSuccess = () => {
    const redirectTo = searchParams.get('redirect') || '/'
    router.push(redirectTo)
  }

  return <LoginAndRegister onLoginSuccess={handleLoginSuccess} />
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#ffffff' }}>
        <Spinner size={48} color="#f97316" />
      </div>
    }>
      <LoginPageContent />
    </Suspense>
  )
}
