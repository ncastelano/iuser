// src/modules/deliveries/index.ts — API pública do domínio "entregas do motorista"
export * from './domain'
export { fetchDriverState, fetchActive, fetchOffers, fetchDoneToday, acceptOffer, leaveForStore, arriveAtStore, pickUpOrders, completeDelivery, setCapacity, setOnline, fetchMyReviews } from './load'
export type { DriverState, DoneToday, MyReview, MyReviews } from './load'
