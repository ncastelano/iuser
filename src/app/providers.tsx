// app/providers.tsx
'use client'

import { QuickReviewHost } from '@/components/ratings/QuickReviewHost'
import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FontLoader } from '@/components/FontLoader'
import { OrderNotification } from '@/components/OrderNotification'
import { PwaCleanup } from '@/components/PwaCleanup'
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt'
import { PushNotificationSetup } from '@/components/PushNotificationSetup'
import { NavigationProgressBar } from '@/components/NavigationProgressBar'
import PageViewTracker from '@/components/PageViewTracker'
import { ThemeColorSync } from '@/components/ThemeColorSync'
import { RideAcceptedDialog } from '@/components/RideAcceptedDialog'
import { DriverLiveLocationBroadcaster } from '@/components/DriverLiveLocationBroadcaster'
import { DriverRideAlertListener } from '@/components/DriverRideAlertListener'
import { IslandToastFallback } from '@/components/IslandToastFallback'
import { SystemEventsListener } from '@/components/SystemEventsListener'
import CheckinPrompt from '@/components/checkin/CheckinPrompt'
import NavProgress, { NavRouterBoost } from '@/components/NavProgress'
import { Suspense } from 'react'
import ImageCropHost from '@/components/ImageCropHost'
import { ProfileProvider } from './contexts/ProfileContext'
import { MaintenanceBanner } from '@/components/MaintenanceNotice'
import ShareDialogHost from '@/components/ShareDialogHost'
import LegalHost from '@/components/legal/LegalHost'
import ScreenDirector from '@/components/dev/ScreenDirector'

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
        <MaintenanceBanner />
        <PageViewTracker />
        <ScreenDirector />
        <ThemeColorSync />
        <NavigationProgressBar />
        <FontLoader />
        <OrderNotification />
        {/* 3.0: avaliação rápida (estrelas, comentário e foto num cartão só); a 2.0 segue com os dois avisos acima */}
        <QuickReviewHost />
        <RideAcceptedDialog />
        <DriverLiveLocationBroadcaster />
        <DriverRideAlertListener />
        <PwaCleanup />
        <PwaInstallPrompt />
        <ShareDialogHost />
        {/* Termos de Uso (quem ainda não aceitou a versão em vigor) e as declarações do motorista e da loja (ensureLegal) */}
        <LegalHost />
        <PushNotificationSetup />
        {/* Avisos: a ilha da 3.0 os mostra (lib/toast); sem ilha (2.0) uma pílula no topo */}
        <IslandToastFallback />
        <SystemEventsListener />
        <CheckinPrompt />
        <Suspense fallback={null}><NavProgress /></Suspense>
        <ImageCropHost />
        <NavRouterBoost>{children}</NavRouterBoost>
      </ProfileProvider>
    </QueryClientProvider>
  )
}
