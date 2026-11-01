import R from './data/results_from_pdf.json'
import { trioPredictions, axis3 } from './trio.js'
export function topTrio(race, preds, n = 3) {
  const t = preds && trioPredictions(preds); if (!t?.combos) return []
  const U = Object.fromEntries(race.entries.map(e => [e.horse_id, e.umaban ?? e.gate]))
  return t.combos.slice(0, n).map(c => c.horses.map(h => U[h.horse_id]))
}
export function TrioTop3({ race, preds, pay }) {
  const t = topTrio(race, preds)
  return <ol className="trio-top3">{t.map((c, i) => { const hit = pay && pay.combo.every(n => c.includes(n)); return <li key={i} className="nowrap">{c.join('−')}{hit && ' ◎的中'}</li> })}</ol>
}
export const trioPayout = raceId => R.trio_payouts?.[raceId] || null
export function picks(race, preds) {
  const U = Object.fromEntries(race.entries.map(e => [e.horse_id, e.umaban ?? e.gate]))
  return { fuku: axis3(preds).map(t => t.map(p => U[p.horse_id])) }
}
// 3連複の予想と配当のみ（馬名・レース名なし）
export function TrioPayout({ race, preds }) {
  const { fuku } = picks(race, preds || [])
  const fp = trioPayout(race.race_id)
  const fHit = c => fp && fp.combo.every(n => c.includes(n))
  return <div className="trio result-row">
    <h3>{race.race_date} {race.race_no}R</h3>
    <p className="meta payout"><b>3連複</b> 予想: {fuku.map((c, i) => <span key={i} className="nowrap">{c.join('−')}{fHit(c) && '◎'}　</span>)}<br />
      配当: {fp ? <><span className="nowrap">{fp.combo.join('−')}</span> <b>{fp.payout.toLocaleString()}円</b>{fuku.some(fHit) ? ' 的中' : ''}</> : '未確定'}</p>
  </div>
}
