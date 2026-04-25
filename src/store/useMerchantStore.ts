import { create } from 'zustand'

interface MerchantStore {
  pendingOrdersCount: number
  setPendingOrdersCount: (count: number) => void
  incrementPending: () => void
  decrementPending: () => void
}

export const useMerchantStore = create<MerchantStore>((set) => ({
  pendingOrdersCount: 0,
  setPendingOrdersCount: (count) => set({ pendingOrdersCount: count }),
  incrementPending: () => set((state) => ({ pendingOrdersCount: state.pendingOrdersCount + 1 })),
  decrementPending: () => set((state) => ({ pendingOrdersCount: Math.max(0, state.pendingOrdersCount - 1) })),
}))
