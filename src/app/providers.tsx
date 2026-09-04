// app/providers.tsx
'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FontLoader } from '@/components/FontLoader'
import { OrderNotification } from '@/components/OrderNotification'
import { PwaCleanup } from '@/components/PwaCleanup'
import { PushNotificationSetup } from '@/components/PushNotificationSetup'
import { NavigationProgressBar } from '@/components/NavigationProgressBar'
import { Toaster } from 'sonner'
import { ProfileProvider } from './contexts/ProfileContext'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <ProfileProvider>
        <NavigationProgressBar />
        <FontLoader />
        <OrderNotification />
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
