// src/modules/deliveries/index.ts — API pública do domínio "entregas do motorista"
export * from './domain'
export { fetchDriverState, fetchActive, fetchOffers, fetchDoneToday, acceptOffer, leaveForStore, arriveAtStore, pickUpOrders, arriveAtDestination, sendDeliveryMessage, completeDelivery, submitProofPin, submitProofPhoto, setCapacity, setCapacityUnits, setOnline, fetchMyReviews } from './load'
export * from './board'
export type { DriverState, DoneToday, MyReview, MyReviews, PickupResult, ProofResult } from './load'
