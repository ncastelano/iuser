import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface MerchantStore {
  pendingOrdersCount: number
  setPendingOrdersCount: (count: number) => void
  incrementPending: () => void
  decrementPending: () => void
  latestOrderNotification: string | null
  setLatestOrderNotification: (message: string | null) => void
  customerOrderStatuses: string[]
  setCustomerOrderStatuses: (statuses: string[]) => void
}

export const useMerchantStore = create<MerchantStore>()(
  persist(
    (set) => ({
      pendingOrdersCount: 0,
      setPendingOrdersCount: (count) => set({ pendingOrdersCount: count }),
      incrementPending: () => set((state) => ({ pendingOrdersCount: state.pendingOrdersCount + 1 })),
      decrementPending: () => set((state) => ({ pendingOrdersCount: Math.max(0, state.pendingOrdersCount - 1) })),
      latestOrderNotification: null,
      setLatestOrderNotification: (message) => set({ latestOrderNotification: message }),
      customerOrderStatuses: [],
      setCustomerOrderStatuses: (statuses) => set({ customerOrderStatuses: statuses }),
    }),
    {
      name: 'iuser-merchant-storage',
    }
  )
)
