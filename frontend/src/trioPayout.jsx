import R from './data/results_from_pdf.json'
import { trioPredictions } from './trio.js'
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
export const tanPayout = raceId => (R.trifecta_payouts || R.sanrentan_payouts)?.[raceId] || null
export function TanPay({ id }) { const t = tanPayout(id); return t ? <><span className="nowrap">{t.combo.join('→')}</span> <b>{t.payout.toLocaleString()}円</b></> : <small>三連単配当 未取得</small> }
export function TrioPayout({ race, preds }) {
  const p = trioPayout(race.race_id); if (!p) return null
  const um = h => h.umaban ?? h.gate
  const pick = preds ? new Set(preds.slice(0, 3).map(x => um(race.entries.find(e => e.horse_id === x.horse_id) || {}))) : null
  const hit = pick && p.combo.every(n => pick.has(n))
  return <div className="result-row" style={{ display: 'flex', gap: '1em', flexWrap: 'wrap', alignItems: 'flex-start' }}>
    <p className="meta payout"><b>{race.race_date} {race.race_no}R 3連複 確定</b> {p.combo.join('−')}：<b>{p.payout.toLocaleString()}円</b>{pick && (hit ? '（予想的中 ◎）' : '（予想不的中）')}<br /><b>三連単</b> <TanPay id={race.race_id} /></p>
    <div className="meta payout"><b>予想3連複 上位3</b><TrioTop3 race={race} preds={preds} pay={p} /></div></div>
}
