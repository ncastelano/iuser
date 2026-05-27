'use client'

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FontLoader } from '@/components/FontLoader'
import { OrderNotification } from '@/components/OrderNotification'
import { Toaster } from 'sonner'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <FontLoader />
      <OrderNotification />
      <Toaster
        position="top-center"
        toastOptions={{
          className: 'rounded-none border-border bg-background text-foreground font-sans shadow-2xl',
        }}
      />
      {children}
    </QueryClientProvider>
  )
}
