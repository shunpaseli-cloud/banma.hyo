import R from '../data/results_from_pdf.json' with { type: 'json' }
import { predict } from '../feedback.js'
import { markOf } from '../marks.js'
import { dayInfo } from '../lib/paginate.js'
// 日別まとめ: レース名・予想上位3頭・実着順上位3頭・3連複払戻
export default function Summary({ date }) {
  const races = dayInfo(date).races
  if (!races.length) return <p className="end">{date} のデータはありません。</p>
  return <div className="summary" style={{ overflowX: 'auto' }}><table className="horses results-big">
    <thead><tr><th>R</th><th>レース名</th><th>予想上位3</th><th>実着順1-3</th><th>3連複</th></tr></thead>
    <tbody>{races.map(race => {
      const H = Object.fromEntries(race.entries.map(e => [e.horse_id, e]))
      const top = predict(race).slice(0, 3).map(p => H[p.horse_id])
      const act = (R.races?.[race.race_id] || []).filter(r => r.finish <= 3).sort((a, b) => a.finish - b.finish)
      const pay = R.trio_payouts?.[race.race_id]
      const hit = pay && top.every(h => pay.combo.includes(h.umaban))
      return <tr key={race.race_id}><td>{race.race_no}</td><td>{race.name.replace(/^帯広\d+R\s*/, '')}</td>
        <td>{top.map((h, i) => <div key={i} className="nowrap">{h.umaban}<span className="mark-in">{markOf(i + 1)}</span> {h.name}</div>)}</td>
        <td>{act.length ? act.map(r => <div key={r.umaban} className="nowrap">{r.finish}着 {r.umaban} {r.name}</div>) : <small>結果未公開</small>}</td>
        <td className="payout">{pay ? <><span className="nowrap">{pay.combo.join('−')}</span><br /><b>{pay.payout.toLocaleString()}円</b>{hit && ' 的中'}</> : '—'}</td></tr>
    })}</tbody></table></div>
}
