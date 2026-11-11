// src/modules/people/index.ts — API pública do domínio "pessoas" (descoberta de pessoas)
export * from './domain'
export { avatarOf, loadNearbyPeople, loadPlaces, loadPeopleInPlace, loadTopPeople, loadNewPeople, loadServiceProviders, searchPeople, loadCommunities, loadFlashes, loadPublications } from './load'
export type { CommunityCard } from './load'
