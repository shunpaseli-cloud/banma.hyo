import { useMemo, useState } from 'react'
import { predict, updateWithResult } from '../feedback.js'
import { trioPredictions } from '../trio.js'
import { analyzeMisses, missWarnings } from '../missAnalysis.js'
export default function RaceCard({ race, onLearn, fetchStatus }) {
  const preds = useMemo(() => predict(race), [race])
  const P = Object.fromEntries(preds.map(p => [p.horse_id, p]))
  const max = preds[0]?.score || 1
  const [open, setOpen] = useState(false)
  const [fin, setFin] = useState({})
  const [msg, setMsg] = useState('')
  const [trioOpen, setTrioOpen] = useState(false)
  const trio = useMemo(() => trioPredictions(preds), [preds])
  const warns = useMemo(() => missWarnings(race), [race])
  const [misses, setMisses] = useState([])
  const H = Object.fromEntries(race.entries.map(h => [h.horse_id, h]))
  const lbl = p => { const h = H[p.horse_id] || {}; return `${h.umaban ?? h.gate ?? '?'} ${h.name ?? ''}` }
  const learn = () => {
    predict(race, true)
    const r = updateWithResult(race, fin)
    setMisses(analyzeMisses(race, preds, fin))
    setMsg(`${r.updated}頭分の結果で重みを更新しました`); setOpen(false); onLearn?.()
  }
  return (
    <article className="card">
      <header className="card-head">
        <span className="rno">{race.race_no}R</span>
        <div><h2>{race.name}</h2>
          <p className="meta">{race.race_date}{race.track_moisture != null && `・馬場水分 ${race.track_moisture}%`}・{race.entries.length}頭</p></div>
      </header>
      <table className="horses">
        <thead><tr><th>枠</th><th>馬番</th><th>馬名</th><th>騎手</th><th>ソリ</th><th>予想スコア</th><th>印</th>{open && <th>着</th>}</tr></thead>
        <tbody>
          {race.entries.map(h => { const p = P[h.horse_id]; return (
            <tr key={h.horse_id} className={p.pred_rank === 1 ? 'top' : ''}>
              <td className="gate">{h.gate}</td><td>{h.umaban ?? '—'}</td><td>{h.name}{warns[h.horse_id] && <span className="warn" title={warns[h.horse_id]}> ⚠</span>}{h.sex && <small> {h.sex}{h.age}</small>}</td><td>{h.jockey}</td><td>{h.sled_weight}kg</td>
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
        <button className="more small" onClick={() => setTrioOpen(!trioOpen)}>{trioOpen ? '上位10通りを閉じる' : '3連複 上位10通り'}</button>
        {msg && <span className="msg">{msg}</span>}
        {fetchStatus && <span className="msg">{fetchStatus.ok
          ? `結果取得OK（${fetchStatus.source === 'pdf' ? '公式PDF' : 'HTML'}・${fetchStatus.updated}頭）`
          : '⚠ 結果を取得できませんでした'}</span>}
      </div>
      {trio && trio.count > 0 && <div className="trio">
        <h3>3連複ボックス（1点）</h3>
        <p className="trio-main">{trio.combos[0].horses.map(lbl).join(' − ')}</p>
        <p className="meta">期待値倍率 {trio.combos[0].evRatio.toFixed(2)}（平均=1.00）・確率シェア {(trio.combos[0].share * 100).toFixed(1)}%・全{trio.count}通り中1位</p>
        {!trioOpen && <ol className="trio-list">{trio.combos.slice(1, 4).map((c, i) =>
          <li key={i}><span>{c.horses.map(h => H[h.horse_id]?.umaban ?? H[h.horse_id]?.gate).join('-')}</span><b>×{c.evRatio.toFixed(2)}</b></li>)}</ol>}
        {trioOpen && <><h3>上位10通り</h3>
        <ol className="trio-list">{trio.combos.slice(0, 10).map((c, i) =>
          <li key={i}><span>{c.horses.map(h => H[h.horse_id]?.umaban ?? H[h.horse_id]?.gate).join('-')}</span>
            <small>{c.horses.map(h => H[h.horse_id]?.name).join('・')}</small>
            <b>×{c.evRatio.toFixed(2)} / {(c.share * 100).toFixed(1)}%</b></li>)}</ol></>}
      </div>}
      {Object.keys(warns).length > 0 && <div className="misswarn"><h3>⚠ 過去の外れ傾向</h3><ul>{Object.entries(warns).map(([id, m]) =>
        <li key={id}>{H[id]?.umaban} {H[id]?.name}: {m}</li>)}</ul></div>}
      {(misses.length ? misses : fetchStatus?.misses || []).length > 0 && <div className="misswarn"><h3>外れ分析</h3><ul>{(misses.length ? misses : fetchStatus.misses).map(m => <li key={m.horse_id}>{m.reason}</li>)}</ul></div>}
    </article>
  )
}
