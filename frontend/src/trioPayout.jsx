import R from './data/results_from_pdf.json'
import rules from './data/skip_rules.json'
import { trio5, trioPredictions, axis3, trifectaBox3, axisGate } from './trio.js'
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
export const trifectaPayout = raceId => R.trifecta_payouts?.[raceId] || null
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
export function TrioPayout({ race, preds }) {
  const gate = axisGate(preds || [])
  const box = boxPicks(race, preds || [])
  const { fuku, kinds } = picks(race, preds || [])
  const fp = trioPayout(race.race_id)
  const tp = trifectaPayout(race.race_id)
  const fHit = c => fp && fp.combo.every(n => c.includes(n))
  const boxHit = tp && box.horses.length === 3 && new Set(tp.combo.map(Number)).size === 3
    && [...new Set(tp.combo.map(Number))].every(n => box.horses.includes(n))
  const label = rules.ticket?.label || '三連単三頭ボックス6点'
  const stake = rules.ticket?.stakeYen || 600
  return <div className="trio result-row">
    <h3>{race.race_date} {race.race_no}R</h3>
    <p className="meta payout"><b>{label}</b>（¥{stake}・BOX{ (rules.ticket?.boxIdx||[0,1,2]).map(i=>i+1).join('') }・pf≥{rules.pastFormThreshold}・k={rules.streakPenaltyK}）
      {' '}予想: {box.horses.length ? <span className="nowrap">{box.horses.join('−')}{boxHit && ' ◎'}</span> : '—'}
      {gate.skip && <span style={{color:'#D85A2A'}}>　⚠見送り推奨</span>}
      <br />
      三連単配当: {tp ? <><span className="nowrap">{tp.combo.join('−')}</span> <b>{(tp.payout ?? tp.yen)?.toLocaleString?.() ?? tp.payout}円</b>{boxHit ? ' 的中' : ''}</> : '未確定'}
    </p>
    <p className="meta payout"><small>参考・3連複5点: {fuku.map((c, i) => <span key={i} className="nowrap">[{kinds[i]}]{c.join('−')}{fHit(c) && '◎'}　</span>)}
      配当: {fp ? <><span className="nowrap">{fp.combo.join('−')}</span> <b>{fp.payout.toLocaleString()}円</b>{fuku.some(fHit) ? ' 的中' : ''}</> : '未確定'}</small></p>
    {rules.paperRun?.enabled && <p className="meta"><small>紙運用/本番: {rules.paperRun.status}</small></p>}
  </div>
}
