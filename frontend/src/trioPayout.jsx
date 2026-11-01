import R from './data/results_from_pdf.json'
import rules from './data/skip_rules.json'
import { trio5, trioPredictions, axis3 } from './trio.js'
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
  return { fuku: trio5(preds).map(o => o.t.map(p => U[p.horse_id])), kinds: trio5(preds).map(o => o.kind) }
}
// 3連複の予想と配当のみ（馬名・レース名なし）
export function TrioPayout({ race, preds }) {
  const { fuku, kinds } = picks(race, preds || [])
  const fp = trioPayout(race.race_id)
  const fHit = c => fp && fp.combo.every(n => c.includes(n))
  return <div className="trio result-row">
    <h3>{race.race_date} {race.race_no}R</h3>
    <p className="meta payout"><b>3連複5点</b>（軸3点＋穴1点＋大穴1点） 予想: {fuku.map((c, i) => <span key={i} className="nowrap">[{kinds[i]}]{c.join('−')}{fHit(c) && '◎'}　</span>)}<br />
      配当: {fp ? <><span className="nowrap">{fp.combo.join('−')}</span> <b>{fp.payout.toLocaleString()}円</b>{fuku.some(fHit) ? ' 的中' : ''}</> : '未確定'}</p>
    {rules.paperRun?.enabled && <p className="meta"><small>紙運用ゲート: 確認期間回収{rules.paperRun.roiGatePct}%超え→次の{rules.paperRun.days}日間 紙運用で実測記録→{rules.paperRun.days}日実測≥{rules.paperRun.roiGatePct}%で本番反映（現状: {rules.paperRun.status}）</small></p>}
  </div>
}
