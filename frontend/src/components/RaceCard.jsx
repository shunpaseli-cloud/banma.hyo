import { TrioPayout } from '../trioPayout.jsx'
import { useMemo, useState } from 'react'
import { predict, updateWithResult } from '../feedback.js'
import { trioPredictions, topBox, trifecta3, axisGate, axis3 } from '../trio.js'
import { fmtTime } from '../learnScore.js'
import { markOf, MARK_LEGEND } from '../marks.js'
import RaceDetail from './RaceDetail.jsx'
import { skipWarnings } from '../skipWarn.js'
import { analyzeMisses, missWarnings } from '../missAnalysis.js'
export default function RaceCard({ race, onLearn, fetchStatus }) {
  const preds = useMemo(() => predict(race), [race])
  const P = Object.fromEntries(preds.map(p => [p.horse_id, p]))
  const max = preds[0]?.score || 1
  const [open, setOpen] = useState(false)
  const [fin, setFin] = useState({})
  const [msg, setMsg] = useState('')
  const [trioOpen, setTrioOpen] = useState(false)
  const [detail, setDetail] = useState(false)
  const trio = useMemo(() => trioPredictions(preds), [preds])
  const box = useMemo(() => topBox(preds), [preds])
  const tri3 = useMemo(() => trifecta3(preds), [preds])
  const gate = useMemo(() => axisGate(preds), [preds])
  const ax3 = useMemo(() => axis3(preds), [preds])
  const learned = preds[0]?.finish_score != null
  const skipW = useMemo(() => skipWarnings(race, preds), [race, preds])
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
          <p className="meta">{race.race_date}{race.track_moisture != null ? `・馬場水分 ${race.track_moisture}%` : race.track_moisture_est != null ? `・馬場水分 推定約${race.track_moisture_est}%（天気予報から）` : ''}・{race.entries.length}頭</p></div>
      </header>
      {skipW.map(w => <div key={w} className="skipwarn" style={{border:'2px solid #D85A2A',color:'#D85A2A',background:'#F3EEE4',padding:'4px 8px',margin:'6px 0',fontWeight:700}}>⚠ {w}<small style={{color:'#221E18',fontWeight:400}}>（参考表示）</small></div>)}
      <table className="horses">
        <thead><tr><th>枠</th><th>馬番 印</th><th>馬名</th><th>騎手</th><th>ソリ</th><th>{learned ? '着順スコア' : '予想スコア'}</th>{learned && <th>予想タイム</th>}{open && <th>着</th>}</tr></thead>
        <tbody>
          {race.entries.map(h => { const p = P[h.horse_id]; return (
            <tr key={h.horse_id} className={p.pred_rank === 1 ? 'top' : ''}>
              <td className="gate">{h.gate}</td><td className="nowrap">{h.umaban ?? '—'}<span className="mark-in">{markOf(p.pred_rank)}</span></td><td>{h.name}{warns[h.horse_id] && <span className="warn" title={warns[h.horse_id]}> ⚠</span>}{h.sex && <small> {h.sex}{h.age}</small>}</td><td>{h.jockey}</td><td>{h.sled_weight}kg</td>
              <td><div className="bar"><span style={{ width: `${(p.score / max) * 100}%` }} /></div>{p.score.toFixed(3)}</td>{learned && <td className="nowrap">{fmtTime(p.pred_time_sec)}</td>}
              {open && <td><input className="fin" type="number" min="1" max={race.entries.length} inputMode="numeric"
                value={fin[h.horse_id] || ''} onChange={e => setFin({ ...fin, [h.horse_id]: e.target.value })} /></td>}
            </tr>) })}
        </tbody>
      </table>
      <p className="meta legend">{MARK_LEGEND}{learned && `・着順スコア/予想タイム = 時系列学習モデル（λ=0.92、${preds[0].model.asOf}${preds[0].model.kind === 'snapshot' ? ' より前の結果' : ' までの結果'}で学習）`}</p>
      <div className="fb">
        {open ? <><button className="more small" onClick={learn}>結果を学習</button>
          <button className="link" onClick={() => setOpen(false)}>閉じる</button></>
          : <button className="link" onClick={() => setOpen(true)}>着順を入力して学習</button>}
        <button className="more small" onClick={() => setTrioOpen(!trioOpen)}>{trioOpen ? '上位10通りを閉じる' : '3連複 上位10通り'}</button>
        <button className="more small" onClick={() => setDetail(!detail)}>{detail ? '詳細を閉じる' : '詳細'}</button>
        {msg && <span className="msg">{msg}</span>}
        {fetchStatus && <span className="msg">{fetchStatus.ok
          ? `結果取得OK（${fetchStatus.source === 'pdf' ? '公式PDF' : 'HTML'}・${fetchStatus.updated}頭）`
          : '⚠ 結果を取得できませんでした'}</span>}
      </div>
      {detail && <RaceDetail race={race} preds={preds} />}
      <TrioPayout race={race} preds={preds} />
      {gate.skip && <div className="skipwarn" style={{border:'2px solid #D85A2A',color:'#221E18',background:'#F3EEE4',padding:'4px 8px',margin:'6px 0'}}>⚠ {gate.reason}</div>}
      {ax3.length === 3 && <div className="trio"><h3>3連複 軸1頭＋相手3頭（3点）</h3><ol className="trio-list">{ax3.map((t, i) => <li key={i}><b>{t.map(p => H[p.horse_id]?.umaban ?? H[p.horse_id]?.gate).join('−')}</b></li>)}</ol></div>}
      {box.top.length >= 3 && <div className="trio">
        <h3>3連複 上位5頭ボックス（{box.combos.length}点）</h3>
        <p className="trio-main">{box.top.map(p => H[p.horse_id]?.umaban ?? H[p.horse_id]?.gate).join('・')}</p>
        <p className="meta">{box.top.map(lbl).join(' / ')}</p>
      </div>}
      {tri3.length === 2 && <div className="trio">
        <h3>三連単 2点（軸1頭＋相手2頭）</h3>
        <ol className="trio-list">{tri3.map((t, i) => <li key={i}><b>{t.map(p => H[p.horse_id]?.umaban ?? H[p.horse_id]?.gate).join(' → ')}</b> <small>{t.map(lbl).join(' → ')}</small></li>)}</ol>
        <p className="meta">軸=着順スコア1位、相手A=2位・B=3位。軸→A→B／軸→B→A</p>
      </div>}
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
