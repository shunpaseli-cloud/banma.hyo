import R from '../data/results_from_pdf.json' with { type: 'json' }
import { predict } from '../feedback.js'
import { markOf } from '../marks.js'
import { TrioTop3, TanPay } from '../trioPayout.jsx'
import { dayInfo } from '../lib/paginate.js'
// 日別まとめ: 日付・R・予想上位3頭・実着順上位3頭・3連複払戻
export default function Summary({ date }) {
  const races = dayInfo(date).races
  if (!races.length) return <p className="end">{date} のデータはありません。</p>
  return <div className="summary" style={{ overflowX: 'auto' }}><table className="horses results-big">
    <thead><tr><th>日付・R</th><th>予想上位3</th><th>実着順1-3</th><th>3連複</th><th>三連単</th><th>予想3連複上位3</th></tr></thead>
    <tbody>{races.map(race => {
      const H = Object.fromEntries(race.entries.map(e => [e.horse_id, e]))
      const preds = predict(race)
      const top = preds.slice(0, 3).map(p => H[p.horse_id])
      const act = (R.races?.[race.race_id] || []).filter(r => r.finish <= 3).sort((a, b) => a.finish - b.finish)
      const pay = R.trio_payouts?.[race.race_id]
      const hit = pay && top.every(h => pay.combo.includes(h.umaban))
      return <tr key={race.race_id}><td className="nowrap">{race.race_date} {race.race_no}R</td>
        <td>{top.map((h, i) => <div key={i} className="nowrap">{h.umaban}<span className="mark-in">{markOf(i + 1)}</span></div>)}</td>
        <td>{act.length ? act.map(r => <div key={r.umaban} className="nowrap">{r.finish}着 {r.umaban}</div>) : <small>結果未公開</small>}</td>
        <td className="payout">{pay ? <><span className="nowrap">{pay.combo.join('−')}</span><br /><b>{pay.payout.toLocaleString()}円</b>{hit && ' 的中'}</> : '—'}</td><td className="payout"><TanPay id={race.race_id} /></td><td><TrioTop3 race={race} preds={preds} pay={pay} /></td></tr>
    })}</tbody></table></div>
}
