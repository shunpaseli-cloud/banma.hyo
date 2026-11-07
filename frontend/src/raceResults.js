import bundled from './data/verified_results.json'
import {snapshotForRace,predictionOf} from './predictionSnapshot.js'

import {STATUS_LABELS} from './settlement.js'
export {STATUS_LABELS,reconcileBox} from './settlement.js'
const positiveInt = n => Number.isInteger(n) && n > 0
const validCombo = c => Array.isArray(c) && c.length === 3 && c.every(positiveInt) && new Set(c).size === 3
export function resultForRace(race, data = bundled) {
  return data.races?.[race.race_id] || {
    status: data.dates?.[race.race_date]?.status || 'missing', finishes: [],
  }
}
// Only the existing, saved recommendation is used. Never call predict here.
export function savedBox(raceId) { return predictionOf(snapshotForRace(raceId)) }
// Adapter for feedback.updateWithResult(race, results). No weights/storage are changed.
export function learningInput(race, result) {
  if (result.status !== 'final') return null
  const results = {}
  for (const row of result.finishes || []) {
    if (!positiveInt(row.finish) || (row.status && row.status !== 'finished')) continue
    const horse = race.entries?.find(e => Number(e.umaban) === Number(row.umaban))
    if (horse && (!row.name || row.name === horse.name)) results[horse.horse_id] = row.finish
  }
  return Object.keys(results).length ? { race_id: race.race_id, results,
    meta: { status: result.status, source_urls: result.source_urls || [], partial: Object.keys(results).length !== race.entries.length,
      excluded: (result.finishes || []).filter(row => !positiveInt(row.finish)).map(row => ({ umaban: row.umaban, status: row.status })),
      note: '結果入力のみ。重み更新は実行していません。updateWithResult(race, results)互換。' } } : null
}
export function validateResults(data) {
  if (data.schema_version !== 1 || !data.races || typeof data.races !== 'object' || Array.isArray(data.races)) throw new Error('schema_version=1, races map required')
  for (const [id, race] of Object.entries(data.races)) {
    if (!/^\d{8}-R\d{2}$/.test(id) || !STATUS_LABELS[race.status]) throw new Error(`Invalid race/status: ${id}`)
    if (!Array.isArray(race.finishes)) throw new Error(`finishes required: ${id}`)
    if (!race.source_urls?.length || race.source_urls.some(u => !/^https?:\/\//.test(u))) throw new Error(`Source URL required: ${id}`)
    const seen = new Set()
    for (const row of race.finishes) {
      if (!positiveInt(row.umaban) || seen.has(row.umaban) || (row.finish != null && !positiveInt(row.finish))) throw new Error(`Invalid finish: ${id}`)
      seen.add(row.umaban)
    }
    for (const kind of ['trio', 'trifecta']) {
      const ps = race.payouts?.[kind]
      if (ps != null && (!Array.isArray(ps) || ps.some(p => !validCombo(p.combo) || !positiveInt(p.yen)))) throw new Error(`Invalid payout: ${id}/${kind}`)
    }
    if (race.status === 'final' && ![1,2,3].every(n => race.finishes.some(f => f.finish === n))) throw new Error(`Final requires top three: ${id}`)
  }
  return data
}
