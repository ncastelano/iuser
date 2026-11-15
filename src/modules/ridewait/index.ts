// src/modules/ridewait/index.ts — API pública do domínio "esperas na corrida"
export * from './domain'
export { RideWaitError, loadRideWaits, requestRideWait, respondRideWait, endRideWait, loadWaitSettings, setRideWaitDiscount } from './load'
