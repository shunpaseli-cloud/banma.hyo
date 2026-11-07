import RaceResult from './RaceResult.jsx'
import { resultForRace } from '../raceResults.js'
import { predict } from '../feedback.js'
import { markOf } from '../marks.js'
import { picks, trioPayout } from '../trioPayout.jsx'
import { dayInfo } from '../lib/paginate.js'
// 日別まとめ: 日付・R・予想上位3頭・実着順上位3頭・3連複払戻
export default function Summary({ date }) {
  const races = dayInfo(date).races
  if (!races.length) return <p className="end">{date} のデータはありません。</p>
  // Verified-result days never generate a fresh prediction for settlement.
  if (races.some(race => resultForRace(race).status !== 'missing')) return <div className="summary">
    {races.map(race => <article className="card" key={race.race_id}>
      <h2>{race.race_date} {race.race_no}R</h2>
      <RaceResult race={race} />
    </article>)}
  </div>
  return <div className="summary" style={{ overflowX: 'auto' }}><table className="horses results-big">
    <thead><tr><th>日付・R</th><th>3連複 予想</th><th>3連複 配当</th></tr></thead>
    <tbody>{races.map(race => {
      const { fuku } = picks(race, predict(race))
      const fp = trioPayout(race.race_id)
      const fh = c => fp && fp.combo.every(n => c.includes(n))
      return <tr key={race.race_id}><td className="nowrap">{race.race_date} {race.race_no}R</td>
        <td>{fuku.map((c, i) => <div key={i} className="nowrap">{c.join('−')}{fh(c) && ' ◎'}</div>)}</td>
        <td className="payout">{fp ? <><span className="nowrap">{fp.combo.join('−')}</span><br /><b>{fp.payout.toLocaleString()}円</b>{fuku.some(fh) && ' 的中'}</> : '—'}</td></tr>
    })}</tbody></table></div>
}
