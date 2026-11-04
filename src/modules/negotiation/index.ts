// src/modules/negotiation/index.ts — API pública do domínio "negociação de corridas"
export * from './domain'
export { NegotiationError, setPassengerOffer, passengerCounter, driverCounter, respondOffer, hourlyCheck, loadOffers, loadEarningGoal, saveEarningGoal, loadRideMinimum, loadRideMinimumCap, forgetRideMinimum } from './load'
export type { EarningGoal } from './load'
