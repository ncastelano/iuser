import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface StoreOrderCounts {
  pending: number
  preparing: number
  ready: number
}

interface MerchantStore {
  pendingOrdersCount: number
  setPendingOrdersCount: (count: number) => void
  incrementPending: () => void
  decrementPending: () => void
  customerOrderStatuses: string[]
  setCustomerOrderStatuses: (statuses: string[]) => void
  pendingReviewsCount: number
  setPendingReviewsCount: (count: number) => void
  /** Contagem pending/preparing/ready por loja, mantida em tempo real por OrderNotification. */
  storeOrderCounts: Record<string, StoreOrderCounts>
  setStoreOrderCounts: (counts: Record<string, StoreOrderCounts>) => void
}

export const useMerchantStore = create<MerchantStore>()(
  persist(
    (set) => ({
      pendingOrdersCount: 0,
      setPendingOrdersCount: (count) => set({ pendingOrdersCount: count }),
      incrementPending: () => set((state) => ({ pendingOrdersCount: state.pendingOrdersCount + 1 })),
      decrementPending: () => set((state) => ({ pendingOrdersCount: Math.max(0, state.pendingOrdersCount - 1) })),
      customerOrderStatuses: [],
      setCustomerOrderStatuses: (statuses) => set({ customerOrderStatuses: statuses }),
      pendingReviewsCount: 0,
      setPendingReviewsCount: (count) => set({ pendingReviewsCount: count }),
      storeOrderCounts: {},
      setStoreOrderCounts: (counts) => set({ storeOrderCounts: counts }),
    }),
    {
      name: 'iuser-merchant-storage',
    }
  )
)
