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
  latestOrderNotification: string | null
  setLatestOrderNotification: (message: string | null) => void
  latestCustomerNotification: string | null
  setLatestCustomerNotification: (message: string | null) => void
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
      latestOrderNotification: null,
      setLatestOrderNotification: (message) => set({ latestOrderNotification: message }),
      latestCustomerNotification: null,
      setLatestCustomerNotification: (message) => set({ latestCustomerNotification: message }),
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
