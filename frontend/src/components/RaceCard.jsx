import { useMemo, useState } from 'react'
import { predict, updateWithResult } from '../feedback.js'
export default function RaceCard({ race, onLearn }) {
  const preds = useMemo(() => predict(race), [race])
  const P = Object.fromEntries(preds.map(p => [p.horse_id, p]))
  const max = preds[0]?.score || 1
  const [open, setOpen] = useState(false)
  const [fin, setFin] = useState({})
  const [msg, setMsg] = useState('')
  const learn = () => {
    predict(race, true)
    const r = updateWithResult(race, fin)
    setMsg(`${r.updated}頭分の結果で重みを更新しました`); setOpen(false); onLearn?.()
  }
  return (
    <article className="card">
      <header className="card-head">
        <span className="rno">{race.race_no}R</span>
        <div><h2>{race.name}</h2>
          <p className="meta">{race.race_date}・馬場水分 {race.track_moisture}%・{race.entries.length}頭</p></div>
      </header>
      <table className="horses">
        <thead><tr><th>枠</th><th>馬名</th><th>騎手</th><th>ソリ</th><th>予想スコア</th><th>印</th>{open && <th>着</th>}</tr></thead>
        <tbody>
          {race.entries.map(h => { const p = P[h.horse_id]; return (
            <tr key={h.horse_id} className={p.pred_rank === 1 ? 'top' : ''}>
              <td className="gate">{h.gate}</td><td>{h.name}</td><td>{h.jockey}</td><td>{h.sled_weight}kg</td>
              <td><div className="bar"><span style={{ width: `${(p.score / max) * 100}%` }} /></div>{p.score.toFixed(3)}</td>
              <td className="mark">{['◎', '○', '▲'][p.pred_rank - 1] || ''}</td>
              {open && <td><input className="fin" type="number" min="1" max={race.entries.length} inputMode="numeric"
                value={fin[h.horse_id] || ''} onChange={e => setFin({ ...fin, [h.horse_id]: e.target.value })} /></td>}
            </tr>) })}
        </tbody>
      </table>
      <div className="fb">
        {open ? <><button className="more small" onClick={learn}>結果を学習</button>
          <button className="link" onClick={() => setOpen(false)}>閉じる</button></>
          : <button className="link" onClick={() => setOpen(true)}>着順を入力して学習</button>}
        {msg && <span className="msg">{msg}</span>}
      </div>
    </article>
  )
}
