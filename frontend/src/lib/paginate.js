import RACES from '../data/races.json'
export function listRaces({ limit = 2, offset = 0 } = {}) {
  const items = RACES.slice(offset, offset + limit)
  return { items, total: RACES.length, has_more: offset + items.length < RACES.length }
}
