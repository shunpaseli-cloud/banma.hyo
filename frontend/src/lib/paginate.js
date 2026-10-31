import { DATA, validPdfRaces } from '../dataSource.js'
import { pickUpcoming, todayJST } from '../upcoming.js'
// 日付別レース索引: 同梱PDF(当日) + src/data/past/*.json（公式PDFから取得済みの開催）
const PAST = import.meta.glob('../data/past/*.json', { eager: true, import: 'default' })
const BY_DATE = {}
function add(races, verified) {
  for (const r of races || []) {
    if (!r.race_date) continue
    const d = (BY_DATE[r.race_date] ||= { races: [], verified: true, ids: new Set() })
    if (d.ids.has(r.race_id)) continue
    d.ids.add(r.race_id); d.races.push(r); d.verified = d.verified && verified
  }
}
add(DATA.races, !DATA.warning)
for (const races of Object.values(PAST)) { try { add(races, validPdfRaces({ source: 'pdf' }, races)) } catch (e) { console.error('[past]', e) } }
for (const d of Object.values(BY_DATE)) d.races.sort((a, b) => a.race_no - b.race_no)
export const DATES = Object.keys(BY_DATE).sort()
export const UPCOMING = pickUpcoming(DATA.races)
export const DEFAULT_DATE = DATES.find(d => d >= todayJST()) || UPCOMING.date || DATES[DATES.length - 1] || todayJST()
export function dayInfo(date) { const d = BY_DATE[date]; return d ? { races: d.races, verified: d.verified } : { races: [], verified: false } }
export function listRaces({ limit = 2, offset = 0, date = DEFAULT_DATE } = {}) {
  const R = dayInfo(date).races, items = R.slice(offset, offset + limit)
  return { items, total: R.length, has_more: offset + items.length < R.length }
}
