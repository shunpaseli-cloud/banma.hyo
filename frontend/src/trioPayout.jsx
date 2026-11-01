import R from './data/results_from_pdf.json'
export const trioPayout = raceId => R.trio_payouts?.[raceId] || null
export function TrioPayout({ race, preds }) {
  const p = trioPayout(race.race_id); if (!p) return null
  const um = h => h.umaban ?? h.gate
  const pick = preds ? new Set(preds.slice(0, 3).map(x => um(race.entries.find(e => e.horse_id === x.horse_id) || {}))) : null
  const hit = pick && p.combo.every(n => pick.has(n))
  return <p className="meta payout"><b>3連複 確定</b> {p.combo.join('−')}：<b>{p.payout.toLocaleString()}円</b>{pick && (hit ? '（予想的中 ◎）' : '（予想不的中）')}</p>
}
