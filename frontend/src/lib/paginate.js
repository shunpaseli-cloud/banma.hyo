import { DATA } from '../dataSource.js'
import { pickUpcoming } from '../upcoming.js'
export const UPCOMING = pickUpcoming(DATA.races)
const RACES = UPCOMING.races
export function listRaces({ limit = 2, offset = 0 } = {}) {
  const items = RACES.slice(offset, offset + limit)
  return { items, total: RACES.length, has_more: offset + items.length < RACES.length }
}
