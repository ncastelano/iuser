// src/modules/radar/index.ts — API pública do domínio "radar"
export {
    SORT_OPTIONS, RADIUS_OPTIONS, distanceKm, formatDistance, normalize, popularity, filterItems, sortItems, crownRanks, countByKind,
} from './domain'
export type { RadarItem, RadarKind, RadarSort, RadarFilters, Point, WithDistance } from './domain'
export { loadRadar } from './load'
