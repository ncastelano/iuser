// src/modules/deliveries/index.ts — API pública do domínio "entregas do motorista"
export * from './domain'
export { fetchDriverState, fetchActive, fetchOffers, fetchDoneToday, acceptOffer, leaveForStore, arriveAtStore, pickUpOrders, completeDelivery, setCapacity, setOnline } from './load'
export type { DriverState, DoneToday } from './load'
