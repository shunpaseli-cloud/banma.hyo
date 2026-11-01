import R from './data/results_from_pdf.json'
import { trioPredictions, axis3, trifecta3 } from './trio.js'
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
export function picks(race, preds) {
  const U = Object.fromEntries(race.entries.map(e => [e.horse_id, e.umaban ?? e.gate]))
  return { fuku: axis3(preds).map(t => t.map(p => U[p.horse_id])), tan: trifecta3(preds).map(t => t.map(p => U[p.horse_id])) }
}
// 3連複・三連単の予想と配当のみ（馬名・レース名なし）
export function TrioPayout({ race, preds }) {
  const { fuku, tan } = picks(race, preds || [])
  const fp = trioPayout(race.race_id), tp = tanPayout(race.race_id)
  const fHit = c => fp && fp.combo.every(n => c.includes(n))
  const tHit = c => tp && tp.combo.every((n, i) => c[i] === n)
  return <div className="trio result-row">
    <h3>{race.race_date} {race.race_no}R</h3>
    <p className="meta payout"><b>3連複</b> 予想: {fuku.map((c, i) => <span key={i} className="nowrap">{c.join('−')}{fHit(c) && '◎'}　</span>)}<br />
      配当: {fp ? <><span className="nowrap">{fp.combo.join('−')}</span> <b>{fp.payout.toLocaleString()}円</b>{fuku.some(fHit) ? ' 的中' : ''}</> : '未確定'}</p>
    <p className="meta payout"><b>三連単</b> 予想: {tan.map((c, i) => <span key={i} className="nowrap">{c.join('→')}{tHit(c) && '◎'}　</span>)}<br />
      配当: {tp ? <><span className="nowrap">{tp.combo.join('→')}</span> <b>{tp.payout.toLocaleString()}円</b>{tan.some(tHit) ? ' 的中' : ''}</> : '未確定'}</p>
  </div>
}
