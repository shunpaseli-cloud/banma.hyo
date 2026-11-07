import bundled from './data/verified_results.json'
import saved from './data/recommendations.json'

export const STATUS_LABELS = {
  missing: '未取得', provisional: '未確定・未公表', final: '確定',
  cancelled: '競走取止', not_held: '非開催',
}
const positiveInt = n => Number.isInteger(n) && n > 0
const validCombo = c => Array.isArray(c) && c.length === 3 && c.every(positiveInt) && new Set(c).size === 3
export function resultForRace(race, data = bundled) {
  return data.races?.[race.race_id] || {
    status: data.dates?.[race.race_date]?.status || 'missing', finishes: [],
  }
}
// Only the existing, saved recommendation is used. Never call predict here.
export function savedBox(raceId, snapshot = saved) {
  const rec = snapshot.races?.find(r => r.race_id === raceId)
  const idx = rec?.selection_meta?.box_idx
  const horses = rec?.selection_meta?.top3?.map(h => Number(h.umaban))
  if (!rec || !idx || idx.join(',') !== '0,1,2' || !validCombo(horses)) return null
  const [a, b, c] = horses
  return { horses, recommended: rec.recommended === true, confidence: rec.confidence,
    savedAt: snapshot.meta?.generated_at_asia_tokyo,
    tickets: [[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]], stakeYen: 600,
  }
}
export function reconcileBox(result, prediction) {
  const unknown = reason => ({ status: 'unavailable', reason, returnYen: null, profitYen: null })
  if (result.status !== 'final') return unknown(STATUS_LABELS[result.status] || '未取得')
  if (!prediction) return unknown('当時の保存予想なし')
  if (!prediction.recommended) return unknown('保存予想は見送り（購入想定なし）')
  if (result.refunds?.length || result.finishes?.some(f => !['finished', 'dnf'].includes(f.status || (f.finish ? 'finished' : 'unknown')))) {
    return unknown('取消・除外・返還等あり（通常の的中／外れと分けて精算確認）')
  }
  // Official payout combinations also handle dead heats. Missing dividends are not zero.
  const payouts = result.payouts?.trifecta
  if (!Array.isArray(payouts) || !payouts.length || payouts.some(p => !validCombo(p.combo) || !positiveInt(p.yen))) {
    return unknown('三連単払戻未取得・要確認')
  }
  const winners = payouts.filter(p => prediction.tickets.some(t => t.join('-') === p.combo.join('-')))
  const returnYen = winners.reduce((sum, p) => sum + p.yen, 0)
  return { status: winners.length ? 'hit' : 'miss', returnYen, profitYen: returnYen - prediction.stakeYen }
}
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
