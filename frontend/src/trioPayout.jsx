import Disclosure from './components/Disclosure.jsx'
import SelectionComment from './components/SelectionComment.jsx'
import { resultForRace } from './raceResults.js'
import RaceResult from './components/RaceResult.jsx'
import R from './data/results_from_pdf.json'
import rules from './data/skip_rules.json'
import { trio5, trioPredictions, axis3, trifectaBox3, axisGate } from './trio.js'
import { buildRaceRecommendation } from './selectionReason.js'
export function topTrio(race, preds, n = 3) {
  const t = preds && trioPredictions(preds); if (!t?.combos) return []
  const U = Object.fromEntries(race.entries.map(e => [e.horse_id, e.umaban ?? e.gate]))
  return t.combos.slice(0, n).map(c => c.horses.map(h => U[h.horse_id]))
}
export function TrioTop3({ race, preds, pay }) {
  const t = topTrio(race, preds)
  return <ol className="trio-top3">{t.map((c, i) => { return <li key={i} className="nowrap">{c.join('−')}</li> })}</ol>
}
const verifiedPayout = (raceId, kind) => {
  const result = resultForRace({ race_id: raceId })
  const p = result.payouts?.[kind]?.[0]
  return p ? { combo: p.combo, payout: p.yen } : null
}
export const trioPayout = raceId => verifiedPayout(raceId, 'trio') || R.trio_payouts?.[raceId] || null
export const trifectaPayout = raceId => verifiedPayout(raceId, 'trifecta') || R.trifecta_payouts?.[raceId] || null
export function picks(race, preds) {
  const U = Object.fromEntries(race.entries.map(e => [e.horse_id, e.umaban ?? e.gate]))
  return { fuku: trio5(preds).map(o => o.t.map(p => U[p.horse_id])), kinds: trio5(preds).map(o => o.kind) }
}
export function boxPicks(race, preds) {
  const U = Object.fromEntries(race.entries.map(e => [e.horse_id, e.umaban ?? e.gate]))
  const idx = rules.ticket?.boxIdx || [0, 1, 2]
  const tickets = trifectaBox3(preds, idx)
  const horses = tickets[0] ? tickets[0].map(p => U[p.horse_id]) : []
  return { horses, tickets: tickets.map(t => t.map(p => U[p.horse_id])), idx }
}
// 主推奨: 三連単三頭ボックス6点（選定#2）。3連複5点は参考表示。
export function TrioPayout({ race, preds, rec: suppliedRec, showReason = true }) {
  const box = boxPicks(race, preds || [])
  const { fuku, kinds } = picks(race, preds || [])
  const rec = suppliedRec || buildRaceRecommendation(race, preds || [])
  const axis=rec.selection_meta?.axis
  const partners=(rec.selection_meta?.top3||[]).filter(h=>Number(h.umaban)!==Number(axis?.umaban))
  return <div className="race-recommendation" data-recommended={rec.recommended?'1':'0'} data-confidence={rec.confidence}>
    <div className="horse-picks"><p><span>軸</span><b>{axis?`${axis.umaban}番 ${axis.name}`:'未保存'}</b></p><p><span>相手</span><b>{partners.map(h=>`${h.umaban}番 ${h.name}`).join(' ／ ')||'未保存'}</b></p></div>
    {showReason && <SelectionComment rec={rec} />}
    <Disclosure label="BOX6券を見る · 各100円／計600円"><ol className="ticket-grid">{box.tickets.map(t=><li key={t.join('-')}>{t.join('−')} <small>100円</small></li>)}</ol></Disclosure>
    <Disclosure label="参考の三連複候補を見る"><ul>{fuku.map((c,i)=><li key={i}>{kinds[i]} · {c.join('−')}</li>)}</ul></Disclosure>
    <RaceResult race={race} />
  </div>
}
