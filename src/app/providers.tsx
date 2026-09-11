// app/providers.tsx
'use client'

import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FontLoader } from '@/components/FontLoader'
import { OrderNotification } from '@/components/OrderNotification'
import { PwaCleanup } from '@/components/PwaCleanup'
import { PushNotificationSetup } from '@/components/PushNotificationSetup'
import { NavigationProgressBar } from '@/components/NavigationProgressBar'
import { FinishedRideTrigger } from '@/components/ratings/FinishedRideTrigger'
import { RideAcceptedDialog } from '@/components/RideAcceptedDialog'
import { DriverLiveLocationBroadcaster } from '@/components/DriverLiveLocationBroadcaster'
import { Toaster } from 'sonner'
import { ProfileProvider } from './contexts/ProfileContext'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  // Muitos componentes chamam supabase.auth.getUser()/getSession() no mount
  // de forma independente (em vez de reaproveitar o ProfileContext), e todos
  // passam pelo mesmo lock de auth (processLock, ver lib/supabase/client.ts).
  // Numa página com várias seções isso enfileira, e mesmo com o timeout maior
  // uma chamada isolada pode ainda estourar o prazo às vezes - não é um erro
  // fatal (a próxima chamada tenta de novo), mas sem isso vira um "Uncaught
  // (in promise)" que derruba a página inteira no overlay de erro do Next em
  // dev. Filtra só esse erro específico do Supabase, deixa qualquer outra
  // rejeição não tratada estourar normalmente.
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.isAcquireTimeout) {
        console.warn('[Supabase] Lock de auth demorou pra liberar, ignorando:', event.reason.message)
        event.preventDefault()
      }
    }

    window.addEventListener('unhandledrejection', handleRejection)
    return () => window.removeEventListener('unhandledrejection', handleRejection)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ProfileProvider>
        <NavigationProgressBar />
        <FontLoader />
        <OrderNotification />
        <FinishedRideTrigger />
        <RideAcceptedDialog />
        <DriverLiveLocationBroadcaster />
        <PwaCleanup />
        <PushNotificationSetup />
        <Toaster
          position="top-center"
          toastOptions={{
            className: 'rounded-none border-border bg-background text-foreground font-sans shadow-2xl',
          }}
        />
        {children}
      </ProfileProvider>
    </QueryClientProvider>
  )
}
